import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import (
    alerts_counter,
    telemetry_ingest_counter,
    telemetry_temperature_gauge,
)
from app.database import get_db
from app.models.machine import Machine, MachineStatus
from app.models.telemetry import TelemetryLog
from app.schemas.telemetry import TelemetryIngest, TelemetryResponse
from app.services.alert_service import evaluate_and_store_alerts
from app.services.ditto_service import ditto_service
from app.services.kafka_producer import publish_alert, publish_telemetry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.post("/ingest")
async def ingest_telemetry(
    payload: TelemetryIngest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Hardened ingestion pipeline:

    Critical path (synchronous, blocks response):
      1. Validate machine exists
      2. Persist telemetry to PostgreSQL
      3. Update machine status
      4. Evaluate + persist alerts

    Non-critical path (background, does NOT block response):
      5. Update Eclipse Ditto twin
      6. Publish to Kafka

    This ensures DB writes always complete even if Ditto/Kafka are slow.
    """
    # 1. Lookup machine
    result = await db.execute(select(Machine).where(Machine.machine_id == payload.machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Machine '{payload.machine_id}' not found. "
                "Register it first via POST /api/v1/machines/"
            ),
        )

    # 2. Persist telemetry
    log = TelemetryLog(
        machine_id=machine.id,
        temperature=payload.temperature,
        vibration=payload.vibration,
        pressure=payload.pressure,
        rpm=payload.rpm,
        power_consumption=payload.power_consumption,
        oil_level=payload.oil_level,
        raw_payload=payload.raw_payload,
    )
    db.add(log)

    # 3. Update machine status
    machine.status = MachineStatus.ONLINE
    await db.flush()

    # 4. Evaluate and persist alerts
    try:
        new_alerts = await evaluate_and_store_alerts(db, machine, payload)
    except Exception as e:
        logger.error("Alert evaluation failed for %s: %s", payload.machine_id, e)
        new_alerts = []

    telemetry_dict = {
        k: v
        for k, v in {
            "temperature": payload.temperature,
            "vibration": payload.vibration,
            "pressure": payload.pressure,
            "rpm": payload.rpm,
            "power_consumption": payload.power_consumption,
            "oil_level": payload.oil_level,
        }.items()
        if v is not None
    }

    # 5 & 6. Background sync (non-blocking for API response)
    background_tasks.add_task(
        _background_sync,
        thing_id=machine.ditto_thing_id,
        telemetry_dict=telemetry_dict,
        machine_id=payload.machine_id,
        alert_payloads=[
            {
                "severity": alert.severity.value,
                "metric": alert.metric,
                "value": alert.value,
                "message": alert.message,
            }
            for alert in new_alerts
        ],
    )

    # Metrics
    telemetry_ingest_counter.labels(machine_id=payload.machine_id).inc()
    if payload.temperature is not None:
        telemetry_temperature_gauge.labels(machine_id=payload.machine_id).set(payload.temperature)

    for alert in new_alerts:
        alerts_counter.labels(
            machine_id=payload.machine_id,
            severity=alert.severity.value,
        ).inc()

    return {
        "status": "ok",
        "machine_id": payload.machine_id,
        "alerts_generated": len(new_alerts),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def _background_sync(
    thing_id: str,
    telemetry_dict: dict,
    machine_id: str,
    alert_payloads: list,
):
    """
    Runs after the HTTP response is sent.
    Failures here do NOT affect the HTTP response code.
    """
    # Ditto update
    if thing_id:
        try:
            await ditto_service.update_telemetry(thing_id, telemetry_dict)
            await ditto_service.update_status(
                thing_id,
                operational=True,
                last_seen=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as e:
            logger.warning("Ditto sync failed for %s: %s", thing_id, e)
    else:
        logger.warning("No Ditto thing_id for machine %s, skipping twin update", machine_id)

    # Kafka telemetry publish
    try:
        await publish_telemetry(machine_id, telemetry_dict)
    except Exception as e:
        logger.warning("Kafka telemetry publish failed for %s: %s", machine_id, e)

    # Kafka alert publish
    for alert in alert_payloads:
        try:
            await publish_alert(machine_id, alert)
        except Exception as e:
            logger.warning("Kafka alert publish failed for %s: %s", machine_id, e)


@router.get("/{machine_id}", response_model=List[TelemetryResponse])
async def get_telemetry(
    machine_id: str,
    limit: int = Query(default=100, le=1000),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    query = select(TelemetryLog).where(TelemetryLog.machine_id == machine.id)
    if from_dt:
        query = query.where(TelemetryLog.timestamp >= from_dt)
    if to_dt:
        query = query.where(TelemetryLog.timestamp <= to_dt)
    query = query.order_by(desc(TelemetryLog.timestamp)).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{machine_id}/latest", response_model=TelemetryResponse)
async def get_latest_telemetry(machine_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    result = await db.execute(
        select(TelemetryLog)
        .where(TelemetryLog.machine_id == machine.id)
        .order_by(desc(TelemetryLog.timestamp))
        .limit(1)
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No telemetry data found for this machine")
    return log