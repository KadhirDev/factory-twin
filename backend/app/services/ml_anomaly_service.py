"""
Factory Twin — ML Anomaly Detection Service
============================================

Algorithm : Isolation Forest (sklearn) + StandardScaler per machine
Fallback   : Existing z-score detector (cold-start / error recovery)
Persistence: Models saved to MODEL_DIR after every training run;
             loaded automatically at startup.
Concurrency: Per-machine asyncio.Lock prevents race on model update.

Scoring pipeline per sample:
  1. Feed z-score fallback (always — keeps baseline warm)
  2. Extract feature vector (CORE_METRICS)
  3. Push to per-machine training buffer
  4. Trigger retraining if due
  5. Cold-start (< MIN_TRAIN_SAMPLES) → return z-score result
  6. Scale features with per-machine StandardScaler
  7. Score with IsolationForest.score_samples()
  8. Map raw score → positive anomaly score
  9. Enrich anomaly_details with top_contributors
 10. Push to score_history for trend tracking
 11. Return AnomalyResult (identical external shape)
"""

import asyncio
import logging
import os
import pickle
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.services.anomaly_service import (
    ANOMALY_THRESHOLD,
    CRITICAL_THRESHOLD,
    AnomalyDetector,
    AnomalyResult,
)

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

# Only metrics that are reliably present in every telemetry sample.
# Keeping the list short reduces noise and feature-extraction failures.
CORE_METRICS = ["temperature", "vibration", "rpm"]

MIN_TRAIN_SAMPLES = 50
RETRAIN_EVERY = 30
BUFFER_SIZE = 500
IF_CONTAMINATION = 0.05
IF_N_ESTIMATORS = 64
IF_RANDOM_STATE = 42
SCORE_HISTORY_SIZE = 20
TREND_SLOPE_THRESHOLD = 0.05

# Disk persistence — writable inside the container
MODEL_DIR = Path(os.environ.get("ML_MODEL_DIR", "/app/ml_models"))


# ── Persistence helpers ────────────────────────────────────────────────────────

def _model_path(machine_id: str) -> Path:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = machine_id.replace(":", "_").replace("/", "_")
    return MODEL_DIR / f"{safe_id}.pkl"


def _save_model(machine_id: str, model: IsolationForest, scaler: StandardScaler) -> None:
    try:
        path = _model_path(machine_id)
        with open(path, "wb") as fh:
            pickle.dump({"model": model, "scaler": scaler}, fh)
        logger.info(f"Model saved: {path}")
    except Exception as e:
        logger.warning(f"Model save failed for {machine_id}: {e}")


def _load_model(machine_id: str):
    """Returns (model, scaler) tuple or (None, None) if no persisted model."""
    try:
        path = _model_path(machine_id)
        if not path.exists():
            return None, None
        with open(path, "rb") as fh:
            data = pickle.load(fh)
        model = data.get("model")
        scaler = data.get("scaler")
        if model is None or scaler is None:
            return None, None
        logger.info(f"Model loaded from disk: {path}")
        return model, scaler
    except Exception as e:
        logger.warning(f"Model load failed for {machine_id}: {e}")
        return None, None


# ── Per-machine state ──────────────────────────────────────────────────────────

@dataclass
class MachineMLState:
    buffer: deque = field(default_factory=lambda: deque(maxlen=BUFFER_SIZE))
    score_history: deque = field(default_factory=lambda: deque(maxlen=SCORE_HISTORY_SIZE))
    model: Optional[IsolationForest] = None
    scaler: Optional[StandardScaler] = None
    samples_since_retrain: int = 0
    total_trained_on: int = 0

    @property
    def ready(self) -> bool:
        return len(self.buffer) >= MIN_TRAIN_SAMPLES

    @property
    def model_available(self) -> bool:
        return self.model is not None and self.scaler is not None


# ── Feature helpers ────────────────────────────────────────────────────────────

def _extract_features(telemetry: dict) -> Optional[List[float]]:
    """Extract CORE_METRICS as feature vector. Returns None if any metric missing."""
    row = []
    for metric in CORE_METRICS:
        val = telemetry.get(metric)
        if val is None:
            return None
        row.append(float(val))
    return row


def _normalize_machine_id(machine_id: str) -> str:
    """Normalise machine_id so 'factory:machine1' and 'machine1' map to the same key."""
    if ":" in machine_id:
        return machine_id.split(":")[-1]
    return machine_id


# ── Training ───────────────────────────────────────────────────────────────────

def _train(state: MachineMLState):
    """
    Fit a StandardScaler then an IsolationForest on the current buffer.
    Returns (model, scaler) or (None, None) on failure.
    """
    try:
        X = np.array(list(state.buffer), dtype=float)
        if X.shape[0] < MIN_TRAIN_SAMPLES:
            return None, None

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = IsolationForest(
            n_estimators=IF_N_ESTIMATORS,
            contamination=IF_CONTAMINATION,
            random_state=IF_RANDOM_STATE,
            n_jobs=1,
        )
        model.fit(X_scaled)
        return model, scaler

    except Exception as e:
        logger.warning(f"Training failed: {e}")
        return None, None


# ── Score mapping ──────────────────────────────────────────────────────────────

def _map_raw_score_to_anomaly(raw_score: float, model: IsolationForest) -> float:
    """
    IsolationForest.score_samples() returns lower values for outliers.
    We map to a positive anomaly score calibrated against the model's offset.

    Mapping strategy:
      - normal range centre ≈ model.offset_
      - anomaly score = max(0, offset_ - raw_score) * SCALE
    """
    offset = getattr(model, "offset_", -0.1)
    diff = offset - raw_score
    scale = ANOMALY_THRESHOLD / 0.35
    return max(0.0, diff * scale)


# ── Explainability ─────────────────────────────────────────────────────────────

def _rank_feature_contributions(
    metric_scores: Dict[str, float],
    metric_stats: Dict[str, dict],
    top_n: int = 3,
) -> List[dict]:
    """
    Rank CORE_METRICS by absolute z-score (from fallback).
    Returns top_n contributor dicts for anomaly_details.
    """
    if not metric_scores:
        return []

    ranked = sorted(
        [(m, z) for m, z in metric_scores.items() if m in CORE_METRICS],
        key=lambda kv: abs(kv[1]),
        reverse=True,
    )[:top_n]

    result = []
    for metric, z in ranked:
        stats = metric_stats.get(metric, {})
        val = stats.get("value")
        mean = stats.get("mean")
        direction = "above" if z > 0 else "below"
        label = metric.replace("_", " ").title()
        desc = f"{label} is {abs(z):.2f}σ {direction} baseline"
        if val is not None and mean is not None:
            desc += f" (value={val:.2f}, mean={mean:.2f})"
        result.append(
            {
                "metric": metric,
                "z_score": round(z, 3),
                "direction": direction,
                "label": label,
                "description": desc,
            }
        )
    return result


# ── Trend ─────────────────────────────────────────────────────────────────────

def _compute_trend(scores: deque) -> str:
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


# ── Main service ───────────────────────────────────────────────────────────────

class MLAnomalyService:
    """
    Async-safe drop-in replacement for AnomalyDetector.
    External interface: await .score(machine_id, telemetry_dict) → AnomalyResult
    """

    def __init__(self):
        self._states: Dict[str, MachineMLState] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._fallback = AnomalyDetector()
        self._load_persisted_models()
        logger.info(
            f"MLAnomalyService initialized "
            f"(core_metrics={CORE_METRICS}, min_train={MIN_TRAIN_SAMPLES}, "
            f"retrain_every={RETRAIN_EVERY}, model_dir={MODEL_DIR})"
        )

    # ── Lock management ───────────────────────────────────────────────────────

    def _get_lock(self, key: str) -> asyncio.Lock:
        """Return (creating if needed) the asyncio.Lock for a machine key."""
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    # ── Startup ───────────────────────────────────────────────────────────────

    def _load_persisted_models(self) -> None:
        """
        Scan MODEL_DIR for persisted model files and pre-populate state.
        Called once at startup — silently skips if directory empty or missing.
        """
        try:
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            files = list(MODEL_DIR.glob("*.pkl"))
            if not files:
                return
            for pkl_path in files:
                machine_id = pkl_path.stem.replace("_", ":", 1)
                model, scaler = _load_model(machine_id)
                if model and scaler:
                    state = self._get_state(machine_id)
                    state.model = model
                    state.scaler = scaler
                    state.total_trained_on = MIN_TRAIN_SAMPLES
                    logger.info(f"Restored model for machine: {machine_id}")
        except Exception as e:
            logger.warning(f"Startup model load error (non-fatal): {e}")

    # ── State ─────────────────────────────────────────────────────────────────

    def _get_state(self, machine_id: str) -> MachineMLState:
        key = _normalize_machine_id(machine_id)
        if key not in self._states:
            self._states[key] = MachineMLState()
        return self._states[key]

    # ── Scoring ───────────────────────────────────────────────────────────────

    async def score(
        self,
        machine_id: str,
        telemetry: Dict[str, Optional[float]],
    ) -> AnomalyResult:
        """
        Async score method. Safe for concurrent calls from the FastAPI event loop.
        The per-machine lock serialises retraining only — scoring reads are lock-free.
        """

        z_result = self._fallback.score(machine_id, telemetry)

        features = _extract_features(telemetry)
        if features is None:
            return z_result

        key = _normalize_machine_id(machine_id)
        state = self._get_state(machine_id)

        async with self._get_lock(key):
            state.buffer.append(features)
            state.samples_since_retrain += 1

            should_train = (
                (state.samples_since_retrain >= RETRAIN_EVERY and state.ready)
                or (not state.model_available and state.ready)
            )
            if should_train:
                loop = asyncio.get_running_loop()
                new_model, new_scaler = await loop.run_in_executor(
                    None, _train, state
                )
                if new_model is not None and new_scaler is not None:
                    state.model = new_model
                    state.scaler = new_scaler
                    state.samples_since_retrain = 0
                    state.total_trained_on = len(state.buffer)
                    _save_model(machine_id, new_model, new_scaler)
                    logger.info(
                        f"IF model retrained for machine={machine_id} "
                        f"on {state.total_trained_on} samples"
                    )

        if not state.model_available:
            state.score_history.append(z_result.composite_score)
            return z_result

        try:
            X_raw = np.array([features], dtype=float)
            X_scaled = state.scaler.transform(X_raw)
            raw = float(state.model.score_samples(X_scaled)[0])
            ml_score = float(_map_raw_score_to_anomaly(raw, state.model))

            is_anomaly = bool(ml_score >= ANOMALY_THRESHOLD)
            is_critical = bool(ml_score >= CRITICAL_THRESHOLD)

            top_contributors = _rank_feature_contributions(
                z_result.metric_scores,
                z_result.metric_stats,
                top_n=3,
            )

            details = {
                "composite_score": round(ml_score, 4),
                "threshold": ANOMALY_THRESHOLD,
                "detector": "isolation_forest",
                "raw_if_score": round(raw, 5),
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
                    f"score={ml_score:.3f} raw={raw:.4f} triggers={triggers}"
                )

            return result

        except Exception as e:
            logger.warning(f"ML scoring failed for {machine_id}, fallback: {e}")
            state.score_history.append(z_result.composite_score)
            return z_result

    # ── Accessors ─────────────────────────────────────────────────────────────

    def get_score_trend(self, machine_id: str) -> dict:
        state = self._get_state(machine_id)
        history = list(state.score_history)
        trend = _compute_trend(state.score_history)
        recent_avg = round(sum(history[-5:]) / len(history[-5:]), 4) if len(history) >= 5 else None
        peak = round(max(history), 4) if history else None
        return {
            "trend": trend,
            "recent_avg": recent_avg,
            "peak_score": peak,
            "history_len": len(history),
            "scores": [round(s, 3) for s in history],
        }

    def get_window_stats(self, machine_id: str) -> dict:
        base_stats = self._fallback.get_window_stats(machine_id)
        state = self._get_state(machine_id)
        for metric_data in base_stats.values():
            metric_data["ml_buffer_size"] = len(state.buffer)
            metric_data["ml_model_ready"] = state.model_available
            metric_data["ml_trained_on"] = state.total_trained_on
        return base_stats

    def reset_machine(self, machine_id: str) -> None:
        key = _normalize_machine_id(machine_id)
        if key in self._states:
            del self._states[key]
        if key in self._locks:
            del self._locks[key]
        try:
            path = _model_path(machine_id)
            if path.exists():
                path.unlink()
                logger.info(f"Persisted model deleted for {machine_id}")
        except Exception as e:
            logger.warning(f"Model deletion failed for {machine_id}: {e}")
        self._fallback.reset_machine(machine_id)
        logger.info(f"ML + z-score windows reset for machine={machine_id}")


# ── AnomalyResult patch ────────────────────────────────────────────────────────

_original_to_details = AnomalyResult.to_details_dict


def _patched_to_details(self) -> dict:
    override = getattr(self, "_details_override", None)
    if override is not None:
        return override
    return _original_to_details(self)


AnomalyResult.to_details_dict = _patched_to_details


# ── Singleton ──────────────────────────────────────────────────────────────────

ml_scorer = MLAnomalyService()