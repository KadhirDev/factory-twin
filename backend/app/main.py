import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import create_tables
from app.routers import machines, telemetry, alerts
from app.services.kafka_producer import start_producer, stop_producer
from app.services.kafka_consumer import consume_telemetry
from app.core.metrics import setup_metrics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

consumer_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logger.info("Starting Factory Twin backend...")
    await create_tables()
    await start_producer()
    global consumer_task
    consumer_task = asyncio.create_task(consume_telemetry())
    logger.info("All services initialized.")
    yield
    # ── Shutdown ──
    logger.info("Shutting down Factory Twin backend...")
    if consumer_task:
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass
    await stop_producer()
    logger.info("Shutdown complete.")

app = FastAPI(
    title="Factory Twin API",
    description="Real-Time Industrial Digital Twin System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
setup_metrics(app)

# Routers
app.include_router(machines.router, prefix="/api/v1")
app.include_router(telemetry.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "factory-twin-backend"}