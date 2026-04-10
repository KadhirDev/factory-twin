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
from app.services.anomaly_service import detector as anomaly_detector
from app.services.ditto_service import ditto_service
from app.services.kafka_producer import publish_alert, publish_telemetry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


# ── Ingest ────────────────────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_telemetry(
    payload: TelemetryIngest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Full ingestion pipeline (DB-first, non-blocking Ditto/Kafka):

    Critical path (synchronous):
      1. Validate machine
      2. AI anomaly scoring
      3. Persist telemetry + anomaly score
      4. Update machine status
      5. Threshold alert evaluation

    Background (non-blocking):
      6. Update Eclipse Ditto twin (includes anomaly flag)
      7. Publish to Kafka
    """
    t_start = time.perf_counter()

    # ── 1. Validate machine ───────────────────────────────────────────────────
    result = await db.execute(
        select(Machine).where(Machine.machine_id == payload.machine_id)
    )
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Machine '{payload.machine_id}' not found. "
                "Register it via POST /api/v1/machines/"
            ),
        )

    # ── 2. AI anomaly scoring ─────────────────────────────────────────────────
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

    anomaly_result = anomaly_detector.score(payload.machine_id, telemetry_dict)

    # ── 3. Persist telemetry + anomaly score ──────────────────────────────────
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

    # ── 4. Update machine status ──────────────────────────────────────────────
    machine.status = MachineStatus.ONLINE
    await db.flush()

    # ── 5. Threshold alert evaluation ────────────────────────────────────────
    try:
        new_alerts = await evaluate_and_store_alerts(db, machine, payload)
    except Exception as e:
        logger.error("Alert evaluation failed for %s: %s", payload.machine_id, e)
        new_alerts = []

    # ── Prometheus metrics ────────────────────────────────────────────────────
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

    # ── 6 & 7. Background: Ditto + Kafka ─────────────────────────────────────
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

    # ── Latency histogram ─────────────────────────────────────────────────────
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
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def _background_sync(
    thing_id: str,
    telemetry_dict: dict,
    machine_id: str,
    anomaly_score: float,
    is_anomaly: bool,
    alert_payloads: list,
):
    """Non-blocking sync to Ditto and Kafka after HTTP response is sent."""

    # Ditto: include anomaly state in twin
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
    else:
        logger.warning(
            "No Ditto thing_id for machine %s, skipping twin update",
            machine_id,
        )

    # Kafka telemetry publish
    try:
        await publish_telemetry(
            machine_id,
            {**telemetry_dict, "anomaly_score": anomaly_score},
        )
    except Exception as e:
        logger.warning("Kafka telemetry publish failed for %s: %s", machine_id, e)

    # Kafka alert publish
    for alert in alert_payloads:
        try:
            await publish_alert(machine_id, alert)
        except Exception as e:
            logger.warning("Kafka alert publish failed for %s: %s", machine_id, e)


async def _update_ditto_anomaly(
    thing_id: str,
    score: float,
    is_anomaly: bool,
) -> None:
    """Update the anomaly feature in the Ditto digital twin."""
    try:
        from app.services.ditto_service import ditto_service as ds

        async with ds._client() as client:
            await client.patch(
                f"{ds.base_url}/api/2/things/{thing_id}/features/anomaly/properties",
                json={
                    "score": round(score, 4),
                    "is_anomaly": is_anomaly,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                headers={"Content-Type": "application/merge-patch+json"},
            )
    except Exception as e:
        logger.debug("Ditto anomaly feature update failed (non-critical): %s", e)


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/{machine_id}", response_model=List[TelemetryResponse])
async def get_telemetry(
    machine_id: str,
    limit: int = Query(default=100, le=1000),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    anomalies_only: bool = Query(
        default=False,
        description="Return only anomalous readings",
    ),
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
async def get_latest_telemetry(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
):
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
        raise HTTPException(
            status_code=404,
            detail="No telemetry data found for this machine",
        )
    return log


@router.get("/{machine_id}/anomalies", response_model=List[TelemetryResponse])
async def get_anomalies(
    machine_id: str,
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the most recent anomalous telemetry readings for a machine.
    Each record includes anomaly_score and anomaly_details.
    """
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
async def get_anomaly_stats(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return anomaly statistics for a machine:
    - Current detector window stats (mean/std per metric)
    - Count of recent anomalies
    """
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    from sqlalchemy import func as sqlfunc

    anomaly_count = await db.execute(
        select(sqlfunc.count(TelemetryLog.id))
        .where(TelemetryLog.machine_id == machine.id)
        .where(TelemetryLog.is_anomaly == True)  # noqa: E712
    )

    return {
        "machine_id": machine_id,
        "anomaly_count": anomaly_count.scalar_one(),
        "detector_windows": anomaly_detector.get_window_stats(machine_id),
        "config": {
            "window_size": 60,
            "min_samples": 15,
            "anomaly_threshold": 2.8,
            "critical_threshold": 4.0,
        },
    }