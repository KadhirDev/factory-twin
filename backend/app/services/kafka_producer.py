import json
import asyncio
import logging
from typing import Optional

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError, KafkaTimeoutError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_producer: Optional[AIOKafkaProducer] = None
_producer_lock = asyncio.Lock()

# ── Circuit Breaker State ──────────────────────────────────────────────────────
_consecutive_failures = 0
_CIRCUIT_OPEN_THRESHOLD = 5
_CIRCUIT_RESET_AFTER_S = 30
_circuit_opened_at: Optional[float] = None


def _is_circuit_open() -> bool:
    import time
    global _circuit_opened_at, _consecutive_failures

    if _circuit_opened_at is None:
        return False

    if time.monotonic() - _circuit_opened_at > _CIRCUIT_RESET_AFTER_S:
        logger.info("Kafka circuit breaker: attempting reset")
        _circuit_opened_at = None
        _consecutive_failures = 0
        return False

    return True


def _record_success():
    global _consecutive_failures, _circuit_opened_at
    _consecutive_failures = 0
    _circuit_opened_at = None


def _record_failure():
    import time
    global _consecutive_failures, _circuit_opened_at

    _consecutive_failures += 1

    if _consecutive_failures >= _CIRCUIT_OPEN_THRESHOLD and _circuit_opened_at is None:
        _circuit_opened_at = time.monotonic()
        logger.error(
            f"Kafka circuit breaker OPENED after {_consecutive_failures} failures. "
            f"Will retry in {_CIRCUIT_RESET_AFTER_S}s."
        )


# ── Producer Lifecycle ─────────────────────────────────────────────────────────

async def start_producer() -> None:
    """Start Kafka producer with retry and safe fallback."""
    global _producer

    async with _producer_lock:
        if _producer is not None:
            logger.info("Kafka producer already initialized")
            return

        for attempt in range(1, 4):
            try:
                _producer = AIOKafkaProducer(
                    bootstrap_servers=settings.kafka_bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                    # Reliability settings
                    acks="all",
                    enable_idempotence=True,
                    max_batch_size=16384,
                    linger_ms=5,
                    request_timeout_ms=10_000,
                    retry_backoff_ms=200,
                )
                await _producer.start()
                logger.info("Kafka producer started successfully")
                return

            except Exception as e:
                logger.warning(f"Kafka start attempt {attempt}/3 failed: {e}")
                if attempt < 3:
                    await asyncio.sleep(2 ** attempt)

        logger.error("Kafka producer failed to start after retries. Running without Kafka.")
        _producer = None


async def stop_producer() -> None:
    """Stop Kafka producer safely."""
    global _producer

    if _producer is None:
        return

    try:
        await asyncio.wait_for(_producer.stop(), timeout=5.0)
        logger.info("Kafka producer stopped")
    except asyncio.TimeoutError:
        logger.warning("Kafka producer stop timed out")
    except Exception as e:
        logger.warning("Error stopping Kafka producer: %s", e)
    finally:
        _producer = None


# ── Internal Publish Logic ─────────────────────────────────────────────────────

async def _publish(topic: str, key: str, value: dict, retries: int = 2) -> None:
    """Safe Kafka publish with retry + circuit breaker."""

    if _producer is None:
        logger.debug("Kafka producer not available, skipping publish")
        return

    if _is_circuit_open():
        logger.debug("Kafka circuit breaker open, skipping publish")
        return

    for attempt in range(retries + 1):
        try:
            await asyncio.wait_for(
                _producer.send_and_wait(
                    topic,
                    value=value,
                    key=key.encode("utf-8"),
                ),
                timeout=5.0,
            )
            _record_success()
            return

        except (KafkaConnectionError, KafkaTimeoutError, asyncio.TimeoutError) as e:
            _record_failure()

            if attempt < retries:
                wait = 0.2 * (2 ** attempt)
                logger.warning(
                    f"Kafka publish failed (attempt {attempt + 1}/{retries + 1}), "
                    f"retrying in {wait}s: {e}"
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    f"Kafka publish permanently failed after {retries + 1} attempts: {e}"
                )

        except Exception as e:
            _record_failure()
            logger.error(f"Unexpected Kafka error: {e}")
            return


# ── Public APIs (UNCHANGED INTERFACE) ──────────────────────────────────────────

async def publish_telemetry(machine_id: str, telemetry: dict) -> None:
    """Publish telemetry event to Kafka."""
    await _publish(
        topic=settings.kafka_telemetry_topic,
        key=machine_id,
        value={"machine_id": machine_id, "telemetry": telemetry},
    )


async def publish_alert(machine_id: str, alert: dict) -> None:
    """Publish alert event to Kafka."""
    await _publish(
        topic=settings.kafka_alerts_topic,
        key=machine_id,
        value={"machine_id": machine_id, "alert": alert},
    )