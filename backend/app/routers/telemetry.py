from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import telemetry_ingest_counter, telemetry_temperature_gauge
from app.database import get_db
from app.models.machine import Machine, MachineStatus
from app.models.telemetry import TelemetryLog
from app.schemas.telemetry import TelemetryIngest, TelemetryResponse
from app.services.alert_service import evaluate_and_store_alerts
from app.services.ditto_service import ditto_service
from app.services.kafka_producer import publish_alert, publish_telemetry

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.post("/ingest")
async def ingest_telemetry(payload: TelemetryIngest, db: AsyncSession = Depends(get_db)):
    """
    Core ingestion endpoint:
    1. Validate machine exists
    2. Persist telemetry to PostgreSQL
    3. Update Ditto digital twin
    4. Run alert evaluation
    5. Publish to Kafka
    """
    # 1. Lookup machine
    result = await db.execute(select(Machine).where(Machine.machine_id == payload.machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{payload.machine_id}' not found")

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

    telemetry_dict = {
        "temperature": payload.temperature,
        "vibration": payload.vibration,
        "pressure": payload.pressure,
        "rpm": payload.rpm,
        "power_consumption": payload.power_consumption,
        "oil_level": payload.oil_level,
    }

    # 3. Update machine status to ONLINE and flush DB changes
    machine.status = MachineStatus.ONLINE
    await db.flush()

    # 4. Update Ditto twin
    if machine.ditto_thing_id:
        await ditto_service.update_telemetry(machine.ditto_thing_id, telemetry_dict)
        await ditto_service.update_status(
            machine.ditto_thing_id,
            operational=True,
            last_seen=datetime.utcnow().isoformat(),
        )

    # 5. Alert evaluation
    alerts = await evaluate_and_store_alerts(db, machine, payload)

    # 6. Prometheus metrics
    telemetry_ingest_counter.labels(machine_id=payload.machine_id).inc()
    if payload.temperature is not None:
        telemetry_temperature_gauge.labels(machine_id=payload.machine_id).set(payload.temperature)

    # 7. Publish to Kafka
    await publish_telemetry(payload.machine_id, telemetry_dict)
    for alert in alerts:
        await publish_alert(
            payload.machine_id,
            {
                "severity": alert.severity.value,
                "metric": alert.metric,
                "value": alert.value,
                "message": alert.message,
            },
        )

    return {
        "status": "ok",
        "machine_id": payload.machine_id,
        "alerts_generated": len(alerts),
    }


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
        raise HTTPException(status_code=404, detail="No telemetry found")
    return log