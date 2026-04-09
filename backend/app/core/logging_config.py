import logging
import sys
import json
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """
    Emit logs as single-line JSON — parseable by Grafana Loki,
    Datadog, CloudWatch, or any structured log tool.
    """
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info:
            log_obj["exc"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_obj["request_id"] = record.request_id
        return json.dumps(log_obj)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any default handlers
    root.handlers.clear()
    root.addHandler(handler)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "aiokafka", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)