import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
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


# ── Table Creation + Safe Additive Migrations ─────────────────────────────────
async def create_tables():
    """
    Create all tables safely at startup using a separate engine without pooling,
    then apply additive column migrations.

    All ALTER TABLE statements use IF NOT EXISTS, so this is fully idempotent
    and safe to run on every startup.
    """
    tmp_engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
    )

    try:
        async with tmp_engine.begin() as conn:
            # Ensure models are imported so metadata is registered
            from app.models import Alert, Machine, TelemetryLog  # noqa: F401

            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables verified / created")

        # Run additive column migrations after base tables exist
        await _run_column_migrations(tmp_engine)

    finally:
        await tmp_engine.dispose()


async def _run_column_migrations(engine) -> None:
    """
    Add new columns that may not exist in older schemas.

    ALTER TABLE ... ADD COLUMN IF NOT EXISTS is idempotent,
    so these migrations are safe to execute on every application boot.
    """
    migrations = [
        # Phase 3: AI anomaly detection columns
        "ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS anomaly_score FLOAT",
        "ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN DEFAULT FALSE",
        "ALTER TABLE telemetry_logs ADD COLUMN IF NOT EXISTS anomaly_details JSONB",
    ]

    async with engine.begin() as conn:
        for stmt in migrations:
            try:
                await conn.execute(text(stmt))
                logger.debug(f"Migration OK: {stmt[:60]}...")
            except Exception as e:
                # Non-fatal: log and continue
                logger.warning(f"Migration skipped ({stmt[:40]}...): {e}")

    logger.info("Column migrations complete")