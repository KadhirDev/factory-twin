import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.machine import Machine
from app.models.alert import Alert, AlertSeverity
from app.schemas.telemetry import TelemetryIngest

logger = logging.getLogger(__name__)

# Thresholds — tune these as needed
THRESHOLDS = {
    "temperature": {"warning": 80.0, "critical": 95.0},
    "vibration": {"warning": 0.5, "critical": 1.0},
    "pressure": {"warning": 7.0, "critical": 9.0},
    "rpm": {"warning": 1800.0, "critical": 2000.0},
    "power_consumption": {"warning": 8.0, "critical": 12.0},
    "oil_level": {"warning": 20.0, "critical": 10.0},  # inverted: low is bad
}

async def evaluate_and_store_alerts(
    db: AsyncSession,
    machine: Machine,
    telemetry: TelemetryIngest
) -> list[Alert]:
    """Check telemetry values against thresholds and create alerts."""
    new_alerts = []

    checks = {
        "temperature": telemetry.temperature,
        "vibration": telemetry.vibration,
        "pressure": telemetry.pressure,
        "rpm": telemetry.rpm,
        "power_consumption": telemetry.power_consumption,
    }

    for metric, value in checks.items():
        if value is None:
            continue
        thresholds = THRESHOLDS.get(metric, {})
        severity = None
        threshold_val = None

        if metric == "oil_level":
            # Low oil is bad
            if value <= thresholds.get("critical", 10.0):
                severity = AlertSeverity.CRITICAL
                threshold_val = thresholds["critical"]
            elif value <= thresholds.get("warning", 20.0):
                severity = AlertSeverity.WARNING
                threshold_val = thresholds["warning"]
        else:
            if value >= thresholds.get("critical", float("inf")):
                severity = AlertSeverity.CRITICAL
                threshold_val = thresholds["critical"]
            elif value >= thresholds.get("warning", float("inf")):
                severity = AlertSeverity.WARNING
                threshold_val = thresholds["warning"]

        if severity:
            alert = Alert(
                machine_id=machine.id,
                severity=severity,
                metric=metric,
                value=value,
                threshold=threshold_val,
                message=f"{machine.name}: {metric} is {value} (threshold: {threshold_val})"
            )
            db.add(alert)
            new_alerts.append(alert)
            logger.warning(f"Alert created: {alert.message}")

    if new_alerts:
        await db.flush()

    return new_alerts