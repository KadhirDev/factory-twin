import json
import logging
from typing import Optional

from aiokafka import AIOKafkaProducer

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_producer: Optional[AIOKafkaProducer] = None


async def start_producer() -> None:
    """Start Kafka producer if broker is reachable; otherwise continue safely without Kafka."""
    global _producer

    if _producer is not None:
        logger.info("Kafka producer already initialized")
        return

    try:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await _producer.start()
        logger.info("Kafka producer started")
    except Exception as e:
        logger.warning("Kafka not available, running without Kafka: %s", e)
        _producer = None


async def stop_producer() -> None:
    """Stop Kafka producer cleanly if it was started."""
    global _producer

    if _producer is None:
        return

    try:
        await _producer.stop()
        logger.info("Kafka producer stopped")
    except Exception as e:
        logger.warning("Error while stopping Kafka producer: %s", e)
    finally:
        _producer = None


async def publish_telemetry(machine_id: str, telemetry: dict) -> None:
    """Publish telemetry event to Kafka."""
    if _producer is None:
        logger.warning("Kafka producer not started, skipping telemetry publish")
        return

    try:
        await _producer.send_and_wait(
            settings.kafka_telemetry_topic,
            value={"machine_id": machine_id, "telemetry": telemetry},
            key=machine_id.encode("utf-8"),
        )
    except Exception as e:
        logger.error("Kafka telemetry publish error for %s: %s", machine_id, e)


async def publish_alert(machine_id: str, alert: dict) -> None:
    """Publish alert event to Kafka."""
    if _producer is None:
        logger.warning("Kafka producer not started, skipping alert publish")
        return

    try:
        await _producer.send_and_wait(
            settings.kafka_alerts_topic,
            value={"machine_id": machine_id, "alert": alert},
            key=machine_id.encode("utf-8"),
        )
    except Exception as e:
        logger.error("Kafka alert publish error for %s: %s", machine_id, e)