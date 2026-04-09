import logging
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.services.ditto_service import ditto_service
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])
settings = get_settings()


async def _check_postgres() -> dict:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        logger.warning(f"Postgres health check failed: {e}")
        return {"status": "error", "detail": str(e)}


async def _check_ditto() -> dict:
    try:
        async with ditto_service._client() as client:
            resp = await client.get(
                f"{settings.ditto_base_url}/api/2/things",
                params={"limit": 1}
            )
            if resp.status_code in (200, 401, 403):
                # 401/403 means Ditto is up, just auth-gated
                return {"status": "ok"}
            return {"status": "degraded", "http_status": resp.status_code}
    except Exception as e:
        logger.warning(f"Ditto health check failed: {e}")
        return {"status": "error", "detail": str(e)}


@router.get("/health")
async def health_simple():
    """Shallow health — for load balancer liveness probes."""
    return {"status": "ok", "service": "factory-twin-backend"}


@router.get("/health/deep")
async def health_deep():
    """
    Deep health — checks all downstream dependencies.
    Returns 200 only if all critical services are reachable.
    Returns 503 if any critical dependency is down.
    """
    postgres = await _check_postgres()
    ditto = await _check_ditto()

    all_ok = all(
        svc["status"] == "ok"
        for svc in [postgres, ditto]
    )

    payload = {
        "status": "ok" if all_ok else "degraded",
        "dependencies": {
            "postgres": postgres,
            "ditto": ditto,
        },
    }

    http_status = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(content=payload, status_code=http_status)