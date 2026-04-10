from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TelemetryIngest(BaseModel):
    machine_id: str = Field(..., example="machine1")
    temperature: Optional[float] = Field(None, example=72.5)
    vibration: Optional[float] = Field(None, example=0.12)
    pressure: Optional[float] = Field(None, example=4.5)
    rpm: Optional[float] = Field(None, example=1450.0)
    power_consumption: Optional[float] = Field(None, example=3.2)
    oil_level: Optional[float] = Field(None, example=85.0)
    raw_payload: Optional[Dict[str, Any]] = None


class AnomalyDetail(BaseModel):
    """Per-metric z-score breakdown — for explainability."""
    metric: str
    value: float
    z_score: float
    mean: float
    std: float


class TelemetryResponse(BaseModel):
    id: UUID
    machine_id: UUID
    timestamp: datetime
    temperature: Optional[float]
    vibration: Optional[float]
    pressure: Optional[float]
    rpm: Optional[float]
    power_consumption: Optional[float]
    oil_level: Optional[float]

    # ── Anomaly fields (None for legacy rows, populated from Phase 3 onward) ──
    anomaly_score: Optional[float] = None
    is_anomaly: Optional[bool] = None
    anomaly_details: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True