import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import (
    alerts_counter,
    anomaly_detected_counter,
    anomaly_score_gauge,
    ingest_duration_histogram,
    telemetry_ingest_counter,
    telemetry_temperature_gauge,
)
from app.database import get_db
from app.models.machine import Machine, MachineStatus
from app.models.telemetry import TelemetryLog
from app.schemas.telemetry import TelemetryIngest, TelemetryResponse
from app.services.alert_service import evaluate_and_store_alerts
from app.services.ml_anomaly_service import ml_scorer
from app.services.ditto_service import ditto_service
from app.services.kafka_producer import publish_alert, publish_telemetry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


# ─────────────────────────────────────────────────────────────
# INGEST PIPELINE
# ─────────────────────────────────────────────────────────────
@router.post("/ingest")
async def ingest_telemetry(
    payload: TelemetryIngest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    t_start = time.perf_counter()

    result = await db.execute(
        select(Machine).where(Machine.machine_id == payload.machine_id)
    )
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(
            status_code=404,
            detail=f"Machine '{payload.machine_id}' not found. Register via POST /api/v1/machines/",
        )

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

    anomaly_result = ml_scorer.score(payload.machine_id, telemetry_dict)

    log = TelemetryLog(
        machine_id=machine.id,
        temperature=payload.temperature,
        vibration=payload.vibration,
        pressure=payload.pressure,
        rpm=payload.rpm,
        power_consumption=payload.power_consumption,
        oil_level=payload.oil_level,
        raw_payload=payload.raw_payload,
        anomaly_score=round(anomaly_result.composite_score, 4),
        is_anomaly=anomaly_result.is_anomaly,
        anomaly_details=(
            anomaly_result.to_details_dict()
            if anomaly_result.is_anomaly
            else None
        ),
    )
    db.add(log)

    machine.status = MachineStatus.ONLINE
    await db.flush()

    try:
        new_alerts = await evaluate_and_store_alerts(db, machine, payload)
    except Exception as e:
        logger.error("Alert evaluation failed for %s: %s", payload.machine_id, e)
        new_alerts = []

    telemetry_ingest_counter.labels(machine_id=payload.machine_id).inc()
    anomaly_score_gauge.labels(machine_id=payload.machine_id).set(
        anomaly_result.composite_score
    )

    if payload.temperature is not None:
        telemetry_temperature_gauge.labels(machine_id=payload.machine_id).set(
            payload.temperature
        )

    for alert in new_alerts:
        alerts_counter.labels(
            machine_id=payload.machine_id,
            severity=alert.severity.value,
        ).inc()

    if anomaly_result.is_anomaly:
        level = "critical" if anomaly_result.is_critical else "warning"
        anomaly_detected_counter.labels(
            machine_id=payload.machine_id,
            level=level,
        ).inc()

    background_tasks.add_task(
        _background_sync,
        thing_id=machine.ditto_thing_id,
        telemetry_dict=telemetry_dict,
        machine_id=payload.machine_id,
        anomaly_score=anomaly_result.composite_score,
        is_anomaly=anomaly_result.is_anomaly,
        alert_payloads=[
            {
                "severity": a.severity.value,
                "metric": a.metric,
                "value": a.value,
                "message": a.message,
            }
            for a in new_alerts
        ],
    )

    ingest_duration_histogram.observe(time.perf_counter() - t_start)

    return {
        "status": "ok",
        "machine_id": payload.machine_id,
        "alerts_generated": len(new_alerts),
        "anomaly": {
            "score": round(anomaly_result.composite_score, 4),
            "is_anomaly": anomaly_result.is_anomaly,
            "is_critical": anomaly_result.is_critical,
            "sample_count": anomaly_result.sample_count,
            "detector": "isolation_forest"
            if anomaly_result.sample_count >= 50
            else "z_score",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────────────────────
# BACKGROUND SYNC
# ─────────────────────────────────────────────────────────────
async def _background_sync(
    thing_id: str,
    telemetry_dict: dict,
    machine_id: str,
    anomaly_score: float,
    is_anomaly: bool,
    alert_payloads: list,
):
    if thing_id:
        try:
            await ditto_service.update_telemetry(thing_id, telemetry_dict)
            await ditto_service.update_status(
                thing_id,
                operational=True,
                last_seen=datetime.now(timezone.utc).isoformat(),
            )
            await _update_ditto_anomaly(thing_id, anomaly_score, is_anomaly)
        except Exception as e:
            logger.warning("Ditto sync failed for %s: %s", thing_id, e)

    try:
        await publish_telemetry(
            machine_id,
            {**telemetry_dict, "anomaly_score": anomaly_score},
        )
    except Exception as e:
        logger.warning("Kafka telemetry publish failed for %s: %s", machine_id, e)

    for alert in alert_payloads:
        try:
            await publish_alert(machine_id, alert)
        except Exception as e:
            logger.warning("Kafka alert publish failed for %s: %s", machine_id, e)


async def _update_ditto_anomaly(thing_id: str, score: float, is_anomaly: bool):
    try:
        async with ditto_service._client() as client:
            await client.patch(
                f"{ditto_service.base_url}/api/2/things/{thing_id}/features/anomaly/properties",
                json={
                    "score": round(score, 4),
                    "is_anomaly": is_anomaly,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                headers={"Content-Type": "application/merge-patch+json"},
            )
    except Exception as e:
        logger.debug("Ditto anomaly update failed: %s", e)


# ─────────────────────────────────────────────────────────────
# READ APIs
# ─────────────────────────────────────────────────────────────
@router.get("/{machine_id}", response_model=List[TelemetryResponse])
async def get_telemetry(
    machine_id: str,
    limit: int = Query(default=100, le=1000),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    anomalies_only: bool = Query(default=False),
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
    if anomalies_only:
        query = query.where(TelemetryLog.is_anomaly == True)  # noqa: E712

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
        raise HTTPException(status_code=404, detail="No telemetry data found")
    return log


@router.get("/{machine_id}/anomalies", response_model=List[TelemetryResponse])
async def get_anomalies(
    machine_id: str,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    result = await db.execute(
        select(TelemetryLog)
        .where(TelemetryLog.machine_id == machine.id)
        .where(TelemetryLog.is_anomaly == True)  # noqa: E712
        .order_by(desc(TelemetryLog.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{machine_id}/anomaly-stats")
async def get_anomaly_stats(machine_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    from sqlalchemy import func as sqlfunc

    anomaly_count_result = await db.execute(
        select(sqlfunc.count(TelemetryLog.id))
        .where(TelemetryLog.machine_id == machine.id)
        .where(TelemetryLog.is_anomaly == True)  # noqa: E712
    )

    state = ml_scorer._get_state(machine_id)
    score_trend = ml_scorer.get_score_trend(machine_id)
    detector_windows = ml_scorer.get_window_stats(machine_id)

    return {
        "machine_id": machine_id,
        "anomaly_count": anomaly_count_result.scalar_one(),
        "detector_windows": detector_windows,
        "score_trend": score_trend,
        "config": {
            "window_size": 50,
            "min_samples": 50,
            "anomaly_threshold": 2.8,
            "critical_threshold": 4.0,
            "detector_type": "isolation_forest"
            if state.model is not None
            else "z_score",
            "ml_buffer_size": len(state.buffer),
            "ml_model_ready": state.model is not None,
            "ml_trained_on": state.total_trained_on,
        },
    }