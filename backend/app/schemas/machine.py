from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.machine import MachineStatus

class MachineCreate(BaseModel):
    machine_id: str = Field(..., example="machine1")
    name: str = Field(..., example="CNC Lathe #1")
    location: str = Field(None, example="Hall A")
    machine_type: str = Field(None, example="CNC")
    description: str = Field(None)

class MachineUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    machine_type: Optional[str] = None
    status: Optional[MachineStatus] = None
    description: Optional[str] = None

class MachineResponse(BaseModel):
    id: UUID
    machine_id: str
    name: str
    location: Optional[str]
    machine_type: Optional[str]
    status: MachineStatus
    ditto_thing_id: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True