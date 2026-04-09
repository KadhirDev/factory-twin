import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaConnectionError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_RECONNECT_DELAY_S = 5


async def consume_telemetry():
    """
    Resilient background Kafka consumer.
    - Reconnects automatically on connection loss
    - Logs unprocessable messages to dead-letter log (never crashes)
    - Gracefully exits on task cancellation
    """
    logger.info(f"Kafka consumer starting on topic: {settings.kafka_telemetry_topic}")

    while True:
        consumer = AIOKafkaConsumer(
            settings.kafka_telemetry_topic,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id="factory-twin-backend-v1",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="latest",
            enable_auto_commit=True,
            session_timeout_ms=30_000,
            heartbeat_interval_ms=10_000,
        )

        try:
            await consumer.start()
            logger.info("Kafka consumer connected")

            async for msg in consumer:
                await _process_message(msg)

        except asyncio.CancelledError:
            logger.info("Kafka consumer received cancellation signal")
            break

        except KafkaConnectionError as e:
            logger.warning(
                f"Kafka consumer lost connection: {e}. "
                f"Reconnecting in {_RECONNECT_DELAY_S}s..."
            )
            await asyncio.sleep(_RECONNECT_DELAY_S)

        except Exception as e:
            logger.error(f"Kafka consumer unexpected error: {e}. Reconnecting...")
            await asyncio.sleep(_RECONNECT_DELAY_S)

        finally:
            try:
                await asyncio.wait_for(consumer.stop(), timeout=5.0)
            except Exception:
                pass

    logger.info("Kafka consumer stopped")


async def _process_message(msg) -> None:
    """
    Process a single Kafka message.
    Any exception here is caught and logged — it NEVER crashes the consumer loop.
    """
    try:
        payload = msg.value
        machine_id = payload.get("machine_id", "unknown")
        telemetry = payload.get("telemetry", {})

        # ── Add your downstream processing here ──────────────────────────
        # Examples:
        #   - ML anomaly detection pipeline
        #   - Time-series aggregation (hourly averages)
        #   - WebSocket push to connected browser clients
        #   - Write to InfluxDB / TimescaleDB
        # ─────────────────────────────────────────────────────────────────

        logger.debug(
            f"Kafka msg processed: machine={machine_id} "
            f"partition={msg.partition} offset={msg.offset} "
            f"metrics={list(telemetry.keys())}"
        )

    except Exception as e:
        # Dead-letter log — message is not re-queued but is recorded
        logger.error(
            f"Dead-letter: failed to process Kafka message "
            f"partition={msg.partition} offset={msg.offset} error={e} "
            f"raw={str(msg.value)[:200]}"
        )