"""
Factory Twin — ML Anomaly Detection Service
============================================

Algorithm: Isolation Forest (sklearn)
Fallback:  Existing z-score detector (anomaly_service.AnomalyDetector)

Design:
  - Per-machine IsolationForest, trained once MIN_TRAIN_SAMPLES collected
  - Automatic retraining every RETRAIN_EVERY new samples
  - z-score fallback during cold-start (sample_count < MIN_TRAIN_SAMPLES)
  - Score mapping: raw IsolationForest score_samples() → positive anomaly magnitude
  - Feature contribution ranking: top deviant metrics added to anomaly_details
  - Score trend: rolling window of recent scores → rising / falling / stable
  - Graceful degradation: any sklearn failure falls back to z-score silently
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
from sklearn.ensemble import IsolationForest

from app.services.anomaly_service import (
    ANOMALY_THRESHOLD,
    CRITICAL_THRESHOLD,
    AnomalyDetector,
    AnomalyResult,
)

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

MIN_TRAIN_SAMPLES = 50
RETRAIN_EVERY = 30
BUFFER_SIZE = 500
IF_CONTAMINATION = 0.05
IF_N_ESTIMATORS = 64
IF_RANDOM_STATE = 42
SCORE_HISTORY_SIZE = 20
TREND_SLOPE_THRESHOLD = 0.05
RAW_SCORE_SCALE = 10.0


# ── Per-machine state ─────────────────────────────────────────────────────────

@dataclass
class MachineMLState:
    buffer: deque = field(default_factory=lambda: deque(maxlen=BUFFER_SIZE))
    score_history: deque = field(
        default_factory=lambda: deque(maxlen=SCORE_HISTORY_SIZE)
    )
    model: Optional[IsolationForest] = None
    samples_since_retrain: int = 0
    total_trained_on: int = 0

    @property
    def ready(self) -> bool:
        return len(self.buffer) >= MIN_TRAIN_SAMPLES


def _extract_features(telemetry: dict) -> Optional[List[float]]:
    """
    Extract feature vector using available core metrics.
    Avoid failing if some optional metrics are missing.
    """
    CORE_METRICS = ["temperature", "vibration", "rpm"]

    row = []
    for metric in CORE_METRICS:
        val = telemetry.get(metric)
        if val is None:
            return None
        row.append(float(val))

    return row


def _train(state: MachineMLState) -> Optional[IsolationForest]:
    """Train a fresh IsolationForest on the current buffer."""
    try:
        X = np.array(list(state.buffer), dtype=float)
        if X.shape[0] < MIN_TRAIN_SAMPLES:
            return None

        model = IsolationForest(
            n_estimators=IF_N_ESTIMATORS,
            contamination=IF_CONTAMINATION,
            random_state=IF_RANDOM_STATE,
            n_jobs=1,
        )
        model.fit(X)
        return model
    except Exception as e:
        logger.warning(f"IsolationForest training failed: {e}")
        return None


def _rank_feature_contributions(
    metric_scores: Dict[str, float],
    metric_stats: Dict[str, dict],
    top_n: int = 3,
) -> List[dict]:
    """
    Rank metrics by absolute z-score magnitude.
    Returns the top_n contributing metrics with readable descriptions.
    """
    if not metric_scores:
        return []

    ranked = sorted(
        metric_scores.items(),
        key=lambda kv: abs(kv[1]),
        reverse=True,
    )[:top_n]

    contributions = []
    for metric, z in ranked:
        stats = metric_stats.get(metric, {})
        val = stats.get("value")
        mean = stats.get("mean")

        direction = "above" if z > 0 else "below"
        label = metric.replace("_", " ").title()

        desc = f"{label} is {abs(z):.2f}σ {direction} baseline"
        if val is not None and mean is not None:
            try:
                desc += f" (value={float(val):.2f}, mean={float(mean):.2f})"
            except (TypeError, ValueError):
                pass

        contributions.append(
            {
                "metric": metric,
                "z_score": round(z, 3),
                "direction": direction,
                "label": label,
                "description": desc,
            }
        )

    return contributions


def _compute_trend(scores: deque) -> str:
    """
    Compute slope of recent anomaly scores.
    Returns 'rising' | 'falling' | 'stable'.
    """
    if len(scores) < 5:
        return "stable"

    arr = list(scores)
    n = len(arr)
    xs = list(range(n))
    xm = (n - 1) / 2
    ym = sum(arr) / n
    num = sum((x - xm) * (y - ym) for x, y in zip(xs, arr))
    den = sum((x - xm) ** 2 for x in xs)
    slope = num / den if den != 0 else 0.0

    if slope > TREND_SLOPE_THRESHOLD:
        return "rising"
    if slope < -TREND_SLOPE_THRESHOLD:
        return "falling"
    return "stable"


# ── Main service ──────────────────────────────────────────────────────────────

class MLAnomalyService:
    """
    Drop-in replacement for AnomalyDetector.
    Identical external interface: .score(machine_id, telemetry_dict) → AnomalyResult
    """

    def __init__(self):
        self._states: Dict[str, MachineMLState] = {}
        self._fallback = AnomalyDetector()
        logger.info(
            f"MLAnomalyService initialized "
            f"(min_train={MIN_TRAIN_SAMPLES}, retrain_every={RETRAIN_EVERY}, "
            f"contamination={IF_CONTAMINATION}, raw_score_scale={RAW_SCORE_SCALE})"
        )

    def _normalize_machine_id(self, machine_id: str) -> str:
        return str(machine_id).strip().lower()

    def _get_state(self, machine_id: str) -> MachineMLState:
        key = self._normalize_machine_id(machine_id)
        if key not in self._states:
            self._states[key] = MachineMLState()
        return self._states[key]

    def score(
        self,
        machine_id: str,
        telemetry: Dict[str, Optional[float]],
    ) -> AnomalyResult:
        """
        Score a telemetry sample.

        Steps:
          1. Feed z-score fallback (always — keeps it warm)
          2. Extract feature vector
          3. Push to ML buffer; trigger retraining if due
          4. Cold start → return z-score result
          5. ML ready → score with IsolationForest
          6. Build top_contributors for explainability
          7. Push score to history for trend tracking
          8. Return AnomalyResult (identical shape, enriched anomaly_details)
        """
        z_result = self._fallback.score(machine_id, telemetry)

        features = _extract_features(telemetry)
        if features is None:
            return z_result

        state = self._get_state(machine_id)

        state.buffer.append(features)
        state.samples_since_retrain += 1

        should_train = (
            (state.samples_since_retrain >= RETRAIN_EVERY and state.ready)
            or (state.model is None and state.ready)
        )

        if should_train:
            new_model = _train(state)
            if new_model is not None:
                state.model = new_model
                state.samples_since_retrain = 0
                state.total_trained_on = len(state.buffer)
                logger.info(
                    f"IF model retrained for machine={machine_id} "
                    f"on {state.total_trained_on} samples"
                )

        if state.model is None:
            state.score_history.append(z_result.composite_score)
            return z_result

        try:
            X = np.array([features], dtype=float)

            # Use raw IsolationForest sample score instead of centered decision function.
            # Lower raw_score => more anomalous, so invert and scale to get a positive
            # anomaly magnitude compatible with existing thresholds.
            raw_score = float(state.model.score_samples(X)[0])
            ml_score = max(0.0, -raw_score * RAW_SCORE_SCALE)

            is_anomaly = ml_score >= ANOMALY_THRESHOLD
            is_critical = ml_score >= CRITICAL_THRESHOLD

            top_contributors = _rank_feature_contributions(
                z_result.metric_scores,
                z_result.metric_stats,
                top_n=3,
            )

            details = {
                "composite_score": round(ml_score, 4),
                "threshold": ANOMALY_THRESHOLD,
                "detector": "isolation_forest",
                "if_raw_score": round(raw_score, 5),
                "top_contributors": top_contributors,
                "metrics": {
                    m: {
                        "z_score": round(z, 4),
                        "value": round(z_result.metric_stats[m]["value"], 4),
                        "mean": round(z_result.metric_stats[m]["mean"], 4),
                        "std": round(z_result.metric_stats[m]["std"], 4),
                    }
                    for m, z in z_result.metric_scores.items()
                    if m in z_result.metric_stats
                },
            }

            result = AnomalyResult(
                composite_score=ml_score,
                is_anomaly=is_anomaly,
                is_critical=is_critical,
                metric_scores=z_result.metric_scores,
                metric_stats=z_result.metric_stats,
                sample_count=state.total_trained_on,
            )
            result._details_override = details

            state.score_history.append(ml_score)

            if is_anomaly:
                level = "CRITICAL" if is_critical else "WARNING"
                triggers = [c["description"] for c in top_contributors[:2]]
                logger.warning(
                    f"ML Anomaly [{level}] machine={machine_id} "
                    f"score={ml_score:.3f} raw={raw_score:.5f} contributors={triggers}"
                )

            return result

        except Exception as e:
            logger.warning(
                f"ML scoring failed for {machine_id}, using z-score fallback: {e}"
            )
            state.score_history.append(z_result.composite_score)
            return z_result

    def get_score_trend(self, machine_id: str) -> dict:
        """
        Return recent score trend for a machine.
        Used by the /anomaly-stats endpoint.
        """
        state = self._get_state(machine_id)
        history = list(state.score_history)
        trend = _compute_trend(state.score_history)

        recent_avg = (
            round(sum(history[-5:]) / len(history[-5:]), 4)
            if len(history) >= 5
            else None
        )
        peak = round(max(history), 4) if history else None

        return {
            "trend": trend,
            "recent_avg": recent_avg,
            "peak_score": peak,
            "history_len": len(history),
            "scores": [round(s, 3) for s in history],
        }

    def get_window_stats(self, machine_id: str) -> dict:
        """
        Returns detector window stats augmented with ML status.
        Compatible with existing /anomaly-stats API shape.
        """
        base_stats = self._fallback.get_window_stats(machine_id)
        state = self._get_state(machine_id)

        for metric_data in base_stats.values():
            metric_data["ml_buffer_size"] = len(state.buffer)
            metric_data["ml_model_ready"] = state.model is not None
            metric_data["ml_trained_on"] = state.total_trained_on

        return base_stats

    def reset_machine(self, machine_id: str) -> None:
        key = self._normalize_machine_id(machine_id)
        if key in self._states:
            del self._states[key]
        self._fallback.reset_machine(machine_id)
        logger.info(f"ML + z-score windows reset for machine={machine_id}")


# ── Singleton ─────────────────────────────────────────────────────────────────
ml_scorer = MLAnomalyService()


# ── Patch AnomalyResult.to_details_dict to support override ───────────────────
_original_to_details = AnomalyResult.to_details_dict


def _patched_to_details(self) -> dict:
    override = getattr(self, "_details_override", None)
    if override is not None:
        return override
    return _original_to_details(self)


AnomalyResult.to_details_dict = _patched_to_details