import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserLogin, Token, UserResponse
from app.services.auth_service import verify_password, create_access_token
from app.core.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with username + password.
    Returns a Bearer token valid for JWT_EXPIRE_HOURS hours.
    """
    result = await db.execute(select(User).where(User.username == payload.username))
    user   = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")

    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token({"sub": user.username, "role": user.role.value})
    logger.info(f"Login: {user.username} ({user.role.value})")
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user