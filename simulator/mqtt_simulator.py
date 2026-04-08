"""
Factory Twin — IoT Simulator
Sends simulated telemetry to the backend REST API (primary)
and also publishes to MQTT broker (secondary, if available).
"""

import asyncio
import random
import httpx
import json
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SIMULATOR] %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BACKEND_URL = "http://host.docker.internal:8000/api/v1/telemetry/ingest"

# Machines to simulate
MACHINES = [
    {"machine_id": "machine1", "base_temp": 65.0, "base_rpm": 1400.0},
    {"machine_id": "machine2", "base_temp": 70.0, "base_rpm": 1550.0},
    {"machine_id": "machine3", "base_temp": 60.0, "base_rpm": 1300.0},
]

def generate_telemetry(machine: dict, tick: int) -> dict:
    """Generate realistic sensor readings with occasional anomalies."""
    # Every 30 ticks, introduce a spike on machine1 to test alerting
    anomaly = (tick % 30 == 0) and (machine["machine_id"] == "machine1")

    return {
        "machine_id": machine["machine_id"],
        "temperature": round(machine["base_temp"] + random.gauss(0, 3) + (20 if anomaly else 0), 2),
        "vibration": round(abs(random.gauss(0.15, 0.05)) + (0.7 if anomaly else 0), 4),
        "pressure": round(4.5 + random.gauss(0, 0.3), 2),
        "rpm": round(machine["base_rpm"] + random.gauss(0, 50), 1),
        "power_consumption": round(3.5 + random.gauss(0, 0.4), 2),
        "oil_level": round(max(5.0, 85.0 - (tick * 0.1) + random.gauss(0, 1)), 1),
    }

async def send_telemetry(client: httpx.AsyncClient, payload: dict):
    try:
        resp = await client.post(BACKEND_URL, json=payload, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            alerts = data.get("alerts_generated", 0)
            logger.info(
                f"✅ [{payload['machine_id']}] temp={payload['temperature']}°C "
                f"rpm={payload['rpm']} alerts={alerts}"
            )
        else:
            logger.warning(f"⚠️  Backend returned {resp.status_code}: {resp.text}")
    except httpx.ConnectError:
        logger.error("❌ Cannot connect to backend. Is it running?")
    except Exception as e:
        logger.error(f"❌ Error: {e}")

async def run_simulator(interval_seconds: float = 2.0):
    logger.info("🏭 Factory Twin Simulator starting...")
    logger.info(f"   Backend: {BACKEND_URL}")
    logger.info(f"   Machines: {[m['machine_id'] for m in MACHINES]}")
    logger.info(f"   Interval: {interval_seconds}s")
    logger.info("   Anomaly injection: every 30 ticks on machine1")
    logger.info("-" * 50)

    tick = 0
    async with httpx.AsyncClient() as client:
        while True:
            tasks = [
                send_telemetry(client, generate_telemetry(m, tick))
                for m in MACHINES
            ]
            await asyncio.gather(*tasks)
            tick += 1
            await asyncio.sleep(interval_seconds)

if __name__ == "__main__":
    asyncio.run(run_simulator(interval_seconds=2.0))