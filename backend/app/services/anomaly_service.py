"""
Factory Twin — Z-Score Anomaly Detector

Design:
  - One rolling window per (machine_id, metric) pair
  - Window size: configurable, default 60 samples
  - Algorithm: modified z-score using mean + std of window
  - Composite score: max |z-score| across all active metrics
  - Cold-start: insufficient data returns score=0.0, is_anomaly=False

Thread safety:
  - Uses a plain dict of deques (single-threaded asyncio event loop, no locks needed)

No external dependencies beyond numpy (already available via most scientific stacks).
Falls back to pure-Python math if numpy is unavailable.
"""

import logging
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

WINDOW_SIZE        = 60     # rolling samples per metric per machine
MIN_SAMPLES        = 15     # minimum samples before scoring (cold-start guard)
ANOMALY_THRESHOLD  = 2.8    # |z-score| above this → anomaly
CRITICAL_THRESHOLD = 4.0    # |z-score| above this → critical anomaly

# Metrics evaluated for anomaly scoring
SCORED_METRICS = [
    "temperature",
    "vibration",
    "pressure",
    "rpm",
    "power_consumption",
]


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class MetricWindow:
    """Rolling window for a single metric on a single machine."""
    values: deque = field(default_factory=lambda: deque(maxlen=WINDOW_SIZE))

    def push(self, value: float) -> None:
        self.values.append(value)

    @property
    def count(self) -> int:
        return len(self.values)

    @property
    def mean(self) -> float:
        return sum(self.values) / len(self.values)

    @property
    def std(self) -> float:
        if len(self.values) < 2:
            return 0.0
        m = self.mean
        variance = sum((x - m) ** 2 for x in self.values) / len(self.values)
        return math.sqrt(variance)

    def z_score(self, value: float) -> float:
        """Return the z-score of value relative to this window."""
        if self.count < MIN_SAMPLES:
            return 0.0
        s = self.std
        if s < 1e-9:
            # Near-zero std: constant signal, any deviation is anomalous
            return abs(value - self.mean) * 1e9 if abs(value - self.mean) > 1e-6 else 0.0
        return (value - self.mean) / s


@dataclass
class AnomalyResult:
    """Result of anomaly scoring for one telemetry sample."""
    composite_score:  float               # max |z| across metrics
    is_anomaly:       bool
    is_critical:      bool
    metric_scores:    Dict[str, float]    # {metric: z_score}
    metric_stats:     Dict[str, dict]     # {metric: {mean, std, value}}
    sample_count:     int                 # min samples across evaluated metrics

    def to_details_dict(self) -> dict:
        """Serializable dict stored in anomaly_details column."""
        return {
            "composite_score": round(self.composite_score, 4),
            "threshold":       ANOMALY_THRESHOLD,
            "metrics": {
                m: {
                    "z_score": round(z, 4),
                    "value":   round(self.metric_stats[m]["value"], 4),
                    "mean":    round(self.metric_stats[m]["mean"],  4),
                    "std":     round(self.metric_stats[m]["std"],   4),
                }
                for m, z in self.metric_scores.items()
            },
        }


# ── Detector ──────────────────────────────────────────────────────────────────

class AnomalyDetector:
    """
    Singleton anomaly detector.
    Maintains in-memory rolling windows for all active machines.
    State is lost on restart — normal behaviour; windows rebuild within
    WINDOW_SIZE samples (≈ 2 minutes at 2s interval).
    """

    def __init__(self):
        # _windows[machine_id][metric] → MetricWindow
        self._windows: Dict[str, Dict[str, MetricWindow]] = {}
        logger.info(
            f"AnomalyDetector initialized "
            f"(window={WINDOW_SIZE}, min_samples={MIN_SAMPLES}, "
            f"threshold={ANOMALY_THRESHOLD})"
        )

    def _get_window(self, machine_id: str, metric: str) -> MetricWindow:
        if machine_id not in self._windows:
            self._windows[machine_id] = {}
        if metric not in self._windows[machine_id]:
            self._windows[machine_id][metric] = MetricWindow()
        return self._windows[machine_id][metric]

    def score(
        self,
        machine_id: str,
        telemetry: Dict[str, Optional[float]],
    ) -> AnomalyResult:
        """
        Score a single telemetry sample.

        Steps:
          1. For each metric in SCORED_METRICS with a non-None value:
             a. Compute z-score against the current window
             b. Push new value into window (AFTER scoring, not before)
          2. Composite score = max |z-score| across all metrics
          3. Return AnomalyResult with full explainability data
        """
        metric_scores: Dict[str, float] = {}
        metric_stats:  Dict[str, dict]  = {}
        min_count = WINDOW_SIZE  # will be reduced to actual minimum

        for metric in SCORED_METRICS:
            value = telemetry.get(metric)
            if value is None:
                continue

            window = self._get_window(machine_id, metric)

            # Score BEFORE pushing (score against history, not including self)
            z = window.z_score(value)
            metric_scores[metric] = z
            metric_stats[metric] = {
                "value": value,
                "mean":  window.mean if window.count > 0 else value,
                "std":   window.std,
            }
            min_count = min(min_count, window.count)

            # Now push to update the window
            window.push(value)

        if not metric_scores:
            # No scoreable metrics in this sample
            return AnomalyResult(
                composite_score=0.0,
                is_anomaly=False,
                is_critical=False,
                metric_scores={},
                metric_stats={},
                sample_count=0,
            )

        composite = max(abs(z) for z in metric_scores.values())
        is_anomaly  = composite >= ANOMALY_THRESHOLD
        is_critical = composite >= CRITICAL_THRESHOLD

        result = AnomalyResult(
            composite_score=composite,
            is_anomaly=is_anomaly,
            is_critical=is_critical,
            metric_scores=metric_scores,
            metric_stats=metric_stats,
            sample_count=min_count,
        )

        if is_anomaly:
            # Find which metric triggered
            top_metric = max(metric_scores, key=lambda m: abs(metric_scores[m]))
            top_z = metric_scores[top_metric]
            level = "CRITICAL" if is_critical else "WARNING"
            logger.warning(
                f"Anomaly [{level}] machine={machine_id} "
                f"score={composite:.2f} "
                f"trigger={top_metric} z={top_z:.2f}"
            )

        return result

    def get_window_stats(self, machine_id: str) -> dict:
        """Return current window statistics for a machine (for debugging / API)."""
        if machine_id not in self._windows:
            return {}
        return {
            metric: {
                "count": w.count,
                "mean":  round(w.mean, 4) if w.count > 0 else None,
                "std":   round(w.std,  4) if w.count > 0 else None,
            }
            for metric, w in self._windows[machine_id].items()
        }

    def reset_machine(self, machine_id: str) -> None:
        """Clear windows for a machine (e.g. after maintenance)."""
        if machine_id in self._windows:
            del self._windows[machine_id]
            logger.info(f"Anomaly windows reset for machine={machine_id}")


# ── Singleton ─────────────────────────────────────────────────────────────────
# One shared instance — safe in single-process asyncio apps.
detector = AnomalyDetector()