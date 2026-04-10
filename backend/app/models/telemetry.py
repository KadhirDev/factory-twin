from sqlalchemy import Column, Float, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    machine_id = Column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    timestamp = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # ── Core sensor metrics ───────────────────────────────────────────────────
    temperature       = Column(Float)
    vibration         = Column(Float)
    pressure          = Column(Float)
    rpm               = Column(Float)
    power_consumption = Column(Float)
    oil_level         = Column(Float)

    # Raw payload for extensibility
    raw_payload = Column(JSON)

    # ── AI anomaly detection (Phase 3) ────────────────────────────────────────
    # anomaly_score: composite z-score across all metrics (higher = more anomalous)
    # is_anomaly:    True when anomaly_score exceeds threshold
    # anomaly_details: per-metric z-scores for explainability
    anomaly_score   = Column(Float,   nullable=True)
    is_anomaly      = Column(Boolean, nullable=True, default=False)
    anomaly_details = Column(JSONB,   nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    machine = relationship("Machine", back_populates="telemetry_logs")