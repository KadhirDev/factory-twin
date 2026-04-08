from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from app.database import get_db
from app.models.machine import Machine
from app.models.alert import Alert, AlertSeverity
from app.schemas.alert import AlertResponse, AlertAcknowledge

router = APIRouter(prefix="/alerts", tags=["Alerts"])

@router.get("/", response_model=List[AlertResponse])
async def list_alerts(
    machine_id: Optional[str] = None,
    severity: Optional[AlertSeverity] = None,
    unacknowledged_only: bool = False,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db)
):
    query = select(Alert).order_by(desc(Alert.created_at)).limit(limit)

    if machine_id:
        result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
        machine = result.scalar_one_or_none()
        if machine:
            query = query.where(Alert.machine_id == machine.id)

    if severity:
        query = query.where(Alert.severity == severity)

    if unacknowledged_only:
        query = query.where(Alert.acknowledged == False)

    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    payload: AlertAcknowledge,
    db: AsyncSession = Depends(get_db)
):
    from uuid import UUID
    from datetime import datetime
    result = await db.execute(select(Alert).where(Alert.id == UUID(alert_id)))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = payload.acknowledged
    if payload.acknowledged:
        alert.acknowledged_at = datetime.utcnow()
    await db.flush()
    await db.refresh(alert)
    return alert