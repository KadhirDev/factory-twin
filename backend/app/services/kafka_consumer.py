import asyncio
import json
import logging
from aiokafka import AIOKafkaConsumer
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

async def consume_telemetry():
    """
    Background Kafka consumer for telemetry topic.
    This is useful for cross-service processing or analytics pipelines.
    """
    consumer = AIOKafkaConsumer(
        settings.kafka_telemetry_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="factory-twin-backend",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="latest",
    )
    await consumer.start()
    logger.info(f"Kafka consumer started on topic: {settings.kafka_telemetry_topic}")
    try:
        async for msg in consumer:
            logger.debug(f"Kafka msg received: partition={msg.partition} offset={msg.offset}")
            # This is where you would trigger additional processing pipelines
            # For example: ML anomaly detection, time-series aggregation, etc.
    except asyncio.CancelledError:
        logger.info("Kafka consumer cancelled")
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")