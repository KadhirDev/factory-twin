"""
Factory Twin — Production IoT Simulator
Features:
- Adaptive interval (backs off if backend is slow/down)
- Realistic sensor drift + anomaly injection
- Structured console output
- Never crashes — logs errors and retries
"""

import asyncio
import random
import httpx
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SIMULATOR] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

BACKEND_URL = "http://host.docker.internal:8000/api/v1/telemetry/ingest"
BASE_INTERVAL = 2.0
MAX_INTERVAL = 30.0
MIN_INTERVAL = 1.0

MACHINES = [
    {
        "machine_id": "machine1",
        "base": {"temperature": 65.0, "rpm": 1400.0, "pressure": 4.5, "oil_level": 85.0},
        "drift": {"temperature": 0.05, "oil_level": -0.02},
    },
    {
        "machine_id": "machine2",
        "base": {"temperature": 70.0, "rpm": 1550.0, "pressure": 5.0, "oil_level": 80.0},
        "drift": {"temperature": 0.03, "oil_level": -0.015},
    },
    {
        "machine_id": "machine3",
        "base": {"temperature": 60.0, "rpm": 1300.0, "pressure": 4.0, "oil_level": 90.0},
        "drift": {"temperature": 0.02, "oil_level": -0.01},
    },
]

_state: dict[str, dict] = {
    machine["machine_id"]: dict(machine["base"]) for machine in MACHINES
}


def _apply_drift(machine: dict) -> None:
    """Gradually drift sensor values to simulate real wear."""
    machine_id = machine["machine_id"]
    for metric, rate in machine.get("drift", {}).items():
        _state[machine_id][metric] = max(0.0, _state[machine_id][metric] + rate)


def _generate_telemetry(machine: dict, tick: int) -> dict:
    """Generate telemetry with drift and periodic anomalies."""
    machine_id = machine["machine_id"]
    base = _state[machine_id]

    anomaly_temp = (tick % 60 == 0) and machine_id == "machine1"
    anomaly_vibration = (tick % 45 == 0) and machine_id == "machine2"

    return {
        "machine_id": machine_id,
        "temperature": round(
            base["temperature"] + random.gauss(0, 2.0) + (25.0 if anomaly_temp else 0),
            2,
        ),
        "vibration": round(
            abs(random.gauss(0.15, 0.04)) + (0.9 if anomaly_vibration else 0),
            4,
        ),
        "pressure": round(base["pressure"] + random.gauss(0, 0.2), 2),
        "rpm": round(base["rpm"] + random.gauss(0, 40), 1),
        "power_consumption": round(3.5 + random.gauss(0, 0.3), 2),
        "oil_level": round(max(2.0, base["oil_level"] + random.gauss(0, 0.5)), 1),
    }


class BackoffController:
    """Tracks consecutive failures and computes adaptive interval."""

    def __init__(self, base: float, min_: float, max_: float):
        self.base = base
        self.min = min_
        self.max = max_
        self._failures = 0

    def success(self) -> float:
        self._failures = max(0, self._failures - 1)
        return self.current()

    def failure(self) -> float:
        self._failures = min(self._failures + 1, 8)
        return self.current()

    def current(self) -> float:
        interval = self.base * (1.5 ** self._failures)
        return min(max(interval, self.min), self.max)

    @property
    def failures(self) -> int:
        return self._failures


async def send_telemetry(
    client: httpx.AsyncClient,
    payload: dict,
    backoff: BackoffController,
) -> bool:
    try:
        resp = await client.post(BACKEND_URL, json=payload, timeout=4.0)
        if resp.status_code == 200:
            data = resp.json()
            alerts = data.get("alerts_generated", 0)
            alert_str = f" 🚨 {alerts} alert(s)" if alerts else ""
            logger.info(
                f"[{payload['machine_id']}] "
                f"T={payload['temperature']}°C "
                f"V={payload['vibration']} "
                f"RPM={payload['rpm']}"
                f"{alert_str}"
            )
            backoff.success()
            return True

        logger.warning(f"Backend {resp.status_code}: {resp.text[:100]}")
        backoff.failure()
        return False

    except httpx.ConnectError:
        if backoff.failures == 0:
            logger.error("Cannot connect to backend. Waiting for it to come up...")
        backoff.failure()
        return False

    except httpx.TimeoutException:
        logger.warning(f"[{payload['machine_id']}] Request timed out")
        backoff.failure()
        return False

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        backoff.failure()
        return False


async def run_simulator():
    logger.info("=" * 55)
    logger.info(" 🏭  Factory Twin IoT Simulator")
    logger.info(f"    Backend : {BACKEND_URL}")
    logger.info(f"    Machines: {[machine['machine_id'] for machine in MACHINES]}")
    logger.info(f"    Interval: {BASE_INTERVAL}s (adaptive backoff up to {MAX_INTERVAL}s)")
    logger.info("=" * 55)

    backoff = BackoffController(BASE_INTERVAL, MIN_INTERVAL, MAX_INTERVAL)
    tick = 0

    async with httpx.AsyncClient() as client:
        while True:
            for machine in MACHINES:
                _apply_drift(machine)

            payloads = [_generate_telemetry(machine, tick) for machine in MACHINES]
            results = await asyncio.gather(
                *[send_telemetry(client, payload, backoff) for payload in payloads],
                return_exceptions=True,
            )

            success_count = sum(1 for result in results if result is True)
            interval = backoff.current()

            if backoff.failures > 2:
                logger.warning(
                    f"Backend degraded ({backoff.failures} consecutive failures). "
                    f"Next retry in {interval:.1f}s"
                )

            if success_count:
                logger.debug(
                    f"Tick={tick} sent={len(payloads)} success={success_count} "
                    f"next_interval={interval:.1f}s at {datetime.now(timezone.utc).isoformat()}"
                )

            tick += 1
            await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(run_simulator())