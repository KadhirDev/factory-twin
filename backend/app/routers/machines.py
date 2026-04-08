from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.machine import Machine
from app.schemas.machine import MachineCreate, MachineUpdate, MachineResponse
from app.services.ditto_service import ditto_service

router = APIRouter(prefix="/machines", tags=["Machines"])

@router.post("/", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
async def create_machine(payload: MachineCreate, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    result = await db.execute(select(Machine).where(Machine.machine_id == payload.machine_id))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Machine ID already exists")

    # Create Ditto twin
    ditto_thing_id = f"factory:{payload.machine_id}"
    await ditto_service.create_thing(
        namespace="factory",
        thing_name=payload.machine_id,
        attributes={
            "name": payload.name,
            "location": payload.location,
            "type": payload.machine_type,
            "description": payload.description,
        }
    )

    # Persist in DB
    machine = Machine(
        machine_id=payload.machine_id,
        name=payload.name,
        location=payload.location,
        machine_type=payload.machine_type,
        description=payload.description,
        ditto_thing_id=ditto_thing_id,
    )
    db.add(machine)
    await db.flush()
    await db.refresh(machine)
    return machine

@router.get("/", response_model=List[MachineResponse])
async def list_machines(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).order_by(Machine.created_at.desc()))
    return result.scalars().all()

@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(machine_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

@router.patch("/{machine_id}", response_model=MachineResponse)
async def update_machine(machine_id: str, payload: MachineUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(machine, field, value)
    await db.flush()
    await db.refresh(machine)
    return machine

@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(machine_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    if machine.ditto_thing_id:
        await ditto_service.delete_thing(machine.ditto_thing_id)
    await db.delete(machine)

@router.get("/{machine_id}/twin")
async def get_machine_twin(machine_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch live twin state directly from Eclipse Ditto."""
    result = await db.execute(select(Machine).where(Machine.machine_id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    twin = await ditto_service.get_thing(machine.ditto_thing_id)
    if not twin:
        raise HTTPException(status_code=404, detail="Twin not found in Ditto")
    return twin