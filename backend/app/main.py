import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging_config import setup_logging
from app.core.middleware import RequestIDMiddleware, global_exception_handler
from app.core.metrics import setup_metrics
from app.core.dependencies import get_current_user
from app.core.seed import seed_default_users
from app.database import create_tables
from app.routers import machines, telemetry, alerts
from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.services.kafka_producer import start_producer, stop_producer
from app.services.kafka_consumer import consume_telemetry
from app.config import get_settings

# ── Bootstrap logging FIRST ───────────────────────────────────────────────────
settings = get_settings()
setup_logging(level="DEBUG" if settings.app_env == "development" else "INFO")
logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None


# ── Lifespan Management ───────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Factory Twin backend starting", extra={"env": settings.app_env})

    await create_tables()
    await seed_default_users()  # idempotent, safe every boot

    global _consumer_task
    if settings.kafka_enabled:
        await start_producer()
        _consumer_task = asyncio.create_task(
            consume_telemetry(),
            name="kafka-consumer",
        )
        logger.info("Kafka integration enabled")
    else:
        logger.warning("Kafka integration disabled for this environment")

    logger.info("All services initialized — ready to serve")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Factory Twin backend shutting down")

    if settings.kafka_enabled:
        if _consumer_task and not _consumer_task.done():
            _consumer_task.cancel()
            try:
                await asyncio.wait_for(_consumer_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        await stop_producer()

    logger.info("Shutdown complete")


# ── App Initialization ────────────────────────────────────────────────────────
app = FastAPI(
    title="Factory Twin API",
    description="Real-Time AI Industrial Digital Twin System",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middleware (order matters) ────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

# ── Exception Handling ────────────────────────────────────────────────────────
app.add_exception_handler(Exception, global_exception_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return structured validation errors instead of 500."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
            "request_id": getattr(request.state, "request_id", "unknown"),
        },
    )


# ── Metrics ───────────────────────────────────────────────────────────────────
setup_metrics(app)

# ── Routers ───────────────────────────────────────────────────────────────────

# Public — no auth required
app.include_router(health_router)  # /health, /health/deep
app.include_router(auth_router)

# Protected — every endpoint in these routers requires a valid JWT.
# The dependencies parameter injects get_current_user on all routes in the router
# without touching the individual router files.
_auth_dep = [Depends(get_current_user)]

app.include_router(machines.router, prefix="/api/v1", dependencies=_auth_dep)
app.include_router(telemetry.router, prefix="/api/v1", dependencies=_auth_dep)
app.include_router(alerts.router, prefix="/api/v1", dependencies=_auth_dep)