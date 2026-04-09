import logging
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Engine (Production Optimized) ──────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=False,                  # Always OFF in production (safe override)
    pool_size=10,                # Persistent connections
    max_overflow=20,             # Burst handling
    pool_timeout=30,             # Wait time for connection
    pool_recycle=1800,           # Prevent stale connections (30 min)
    pool_pre_ping=True,          # Validate connection before use
)

# ── Session Factory ────────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,             # Explicit flush control (safer for async flows)
)


# ── Base Model ─────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency (UNCHANGED INTERFACE) ───────────────────────────────────────────
async def get_db() -> AsyncSession:
    """
    FastAPI dependency — yields a session and handles
    commit / rollback / close automatically.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Table Creation (Safe Startup) ──────────────────────────────────────────────
async def create_tables():
    """
    Create tables safely at startup using a separate engine
    without pooling to avoid connection conflicts.
    """
    tmp_engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
    )

    try:
        async with tmp_engine.begin() as conn:
            # Ensure models are imported so metadata is registered
            from app.models import Machine, TelemetryLog, Alert  # noqa: F401

            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables verified / created")

    finally:
        await tmp_engine.dispose()