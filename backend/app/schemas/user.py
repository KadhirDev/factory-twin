from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.user import UserRole


class UserLogin(BaseModel):
    username: str = Field(..., example="admin")
    password: str = Field(..., example="admin123")


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None
    role:     Optional[str] = None


class UserResponse(BaseModel):
    id:         UUID
    username:   str
    email:      Optional[str]
    role:       UserRole
    is_active:  bool
    created_at: datetime

    class Config:
        from_attributes = True