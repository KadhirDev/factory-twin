import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

# ── Default dev users ─────────────────────────────────────────────────────────
# Change passwords via environment / admin UI in production.
_DEFAULT_USERS = [
    {"username": "admin",    "password": "admin123",    "role": UserRole.ADMIN,    "email": "admin@factory.local"},
    {"username": "engineer", "password": "engineer123", "role": UserRole.ENGINEER, "email": "engineer@factory.local"},
    {"username": "operator", "password": "operator123", "role": UserRole.OPERATOR, "email": "operator@factory.local"},
    {"username": "viewer",   "password": "viewer123",   "role": UserRole.VIEWER,   "email": "viewer@factory.local"},
]


async def seed_default_users() -> None:
    """
    Idempotently create default development users.
    Skips any username that already exists.
    Safe to call on every startup.
    """
    async with AsyncSessionLocal() as session:
        for spec in _DEFAULT_USERS:
            result = await session.execute(
                select(User).where(User.username == spec["username"])
            )
            if result.scalar_one_or_none() is not None:
                continue  # already exists

            user = User(
                username        = spec["username"],
                email           = spec["email"],
                hashed_password = hash_password(spec["password"]),
                role            = spec["role"],
                is_active       = True,
            )
            session.add(user)
            logger.info(f"Seeded user: {spec['username']} ({spec['role'].value})")

        await session.commit()

    logger.info("User seed complete")