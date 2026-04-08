from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Counter, Gauge, Histogram

telemetry_ingest_counter = Counter(
    "factory_twin_telemetry_ingested_total",
    "Total number of telemetry records ingested",
    ["machine_id"]
)

active_machines_gauge = Gauge(
    "factory_twin_active_machines",
    "Number of machines currently online"
)

alerts_counter = Counter(
    "factory_twin_alerts_total",
    "Total number of alerts generated",
    ["machine_id", "severity"]
)

telemetry_temperature_gauge = Gauge(
    "factory_twin_temperature",
    "Current temperature reading per machine",
    ["machine_id"]
)

def setup_metrics(app):
    Instrumentator().instrument(app).expose(app)