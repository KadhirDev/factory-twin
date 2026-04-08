from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.alert import AlertSeverity

class AlertResponse(BaseModel):
    id: UUID
    machine_id: UUID
    severity: AlertSeverity
    metric: str
    value: Optional[float]
    threshold: Optional[float]
    message: Optional[str]
    acknowledged: bool
    created_at: datetime
    acknowledged_at: Optional[datetime]

    class Config:
        from_attributes = True

class AlertAcknowledge(BaseModel):
    acknowledged: bool = True