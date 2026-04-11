import React, { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  AlertTriangle,
  CheckCircle,
  Zap,
  Droplets,
  ThumbsUp,
  GitMerge,
  Clock,
} from "lucide-react";
import { AnomalyScorePill } from "./AnomalyBadge";

// ── Trend detector ────────────────────────────────────────────────────────────
function detectTrend(values = []) {
  if (!values?.length || values.length < 6) return "stable";
  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid);
  const newer = values.slice(mid);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(newer) - avg(older);
  const base = Math.abs(avg(older)) || 1;
  const pct = Math.abs(diff) / base;
  if (pct > 0.03) return diff > 0 ? "rising" : "falling";
  return "stable";
}

// ── Linear projection ─────────────────────────────────────────────────────────
function projectToThreshold(values = [], threshold, risingIsBad = true) {
  if (values.length < 6) return null;
  const n = values.length;
  const last = values[n - 1];

  const slice = values.slice(-10);
  const xMean = (slice.length - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / slice.length;
  let num = 0;
  let den = 0;

  slice.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });

  const slope = den !== 0 ? num / den : 0;

  const headingToThreshold = risingIsBad
    ? slope > 0 && last < threshold
    : slope < 0 && last > threshold;

  if (!headingToThreshold || Math.abs(slope) < 1e-6) return null;

  const steps = Math.ceil((threshold - last) / slope);
  if (steps <= 0 || steps > 500) return null;
  return steps;
}

// ── Correlation detector ──────────────────────────────────────────────────────
function detectCorrelations(telemetry = []) {
  const PAIRS = [
    { a: "temperature", b: "vibration", label: "Temperature & Vibration" },
    { a: "temperature", b: "power_consumption", label: "Temperature & Power" },
    { a: "rpm", b: "vibration", label: "RPM & Vibration" },
    { a: "pressure", b: "power_consumption", label: "Pressure & Power" },
  ];

  const safe = telemetry || [];
  if (safe.length < 8) return [];

  const correlated = [];

  PAIRS.forEach(({ a, b, label }) => {
    const aVals = safe.map((d) => d[a]).filter((v) => v != null).reverse();
    const bVals = safe.map((d) => d[b]).filter((v) => v != null).reverse();
    if (aVals.length < 8 || bVals.length < 8) return;

    const aTrend = detectTrend(aVals);
    const bTrend = detectTrend(bVals);

    if (aTrend === "rising" && bTrend === "rising") {
      correlated.push(label);
    }
  });

  return correlated;
}

// ── Anomaly frequency trend ───────────────────────────────────────────────────
function detectAnomalyFrequencyTrend(telemetry = []) {
  const safe = (telemetry || []).filter((d) => d.is_anomaly != null);
  if (safe.length < 8) return "unknown";

  const mid = Math.floor(safe.length / 2);
  const older = safe.slice(mid);
  const newer = safe.slice(0, mid);

  const rate = (arr) => arr.filter((d) => d.is_anomaly).length / arr.length;
  const diff = rate(newer) - rate(older);

  if (Math.abs(diff) < 0.05) return "stable";
  return diff > 0 ? "increasing" : "decreasing";
}

// ── Insight generator ─────────────────────────────────────────────────────────
function generateInsights(telemetry = [], anomalies = [], anomalyStats = null) {
  const insights = [];
  const safe = telemetry || [];
  if (!safe.length) return insights;

  const METRICS = {
    temperature: {
      label: "Temperature",
      unit: "°C",
      warnVal: 80,
      critVal: 95,
      inverted: false,
    },
    vibration: {
      label: "Vibration",
      unit: "",
      warnVal: 0.5,
      critVal: 1.0,
      inverted: false,
    },
    rpm: {
      label: "RPM",
      unit: " rpm",
      warnVal: 1800,
      critVal: null,
      inverted: false,
    },
    pressure: {
      label: "Pressure",
      unit: " bar",
      warnVal: 7.0,
      critVal: 9.0,
      inverted: false,
    },
    oil_level: {
      label: "Oil level",
      unit: "%",
      warnVal: 20,
      critVal: 10,
      inverted: true,
    },
    power_consumption: {
      label: "Power",
      unit: " kW",
      warnVal: 8.0,
      critVal: 12,
      inverted: false,
    },
  };

  Object.entries(METRICS).forEach(([key, cfg]) => {
    const values = safe.map((d) => d[key]).filter((v) => v != null).reverse();
    if (values.length < 4) return;

    const trend = detectTrend(values);
    const current = values[values.length - 1];

    if (cfg.inverted) {
      if (current <= (cfg.critVal ?? 0)) {
        insights.push({
          type: "critical",
          icon: Droplets,
          text: `${cfg.label} critically low at ${current.toFixed(1)}${cfg.unit} — maintenance required immediately.`,
        });
      } else if (trend === "falling") {
        const steps = projectToThreshold(values, cfg.warnVal, false);
        const hint =
          steps != null
            ? ` At this rate, warning threshold reached in ~${Math.round((steps * 2) / 60)} min.`
            : "";
        insights.push({
          type: "warning",
          icon: TrendingDown,
          text: `${cfg.label} trending downward (${current.toFixed(1)}${cfg.unit}) — schedule maintenance.${hint}`,
        });
      }
      return;
    }

    const atCrit = cfg.critVal && current >= cfg.critVal;
    const atWarn = cfg.warnVal && current >= cfg.warnVal;
    const nearWarn = cfg.warnVal && current >= cfg.warnVal * 0.82;

    if (atCrit) {
      insights.push({
        type: "critical",
        icon: AlertTriangle,
        text: `${cfg.label} at ${current.toFixed(1)}${cfg.unit} — critical threshold exceeded.`,
      });
    } else if (atWarn && trend === "rising") {
      insights.push({
        type: "warning",
        icon: TrendingUp,
        text: `${cfg.label} at warning level and still rising (${current.toFixed(1)}${cfg.unit}).`,
      });
    } else if (!atWarn && nearWarn && trend === "rising") {
      const steps = projectToThreshold(values, cfg.warnVal, true);
      const hint =
        steps != null
          ? ` Projected to reach warning threshold in ~${Math.round((steps * 2) / 60)} min.`
          : "";
      insights.push({
        type: "info",
        icon: Clock,
        text: `${cfg.label} approaching warning threshold (${current.toFixed(1)}${cfg.unit}).${hint}`,
      });
    } else if (key === "rpm" && trend === "falling") {
      insights.push({
        type: "info",
        icon: TrendingDown,
        text: `RPM decreasing — possible load reduction or machine slowdown (${current.toFixed(0)} rpm).`,
      });
    }
  });

  // ── Metric correlation insights ───────────────────────────────────────────
  const correlated = detectCorrelations(safe);
  correlated.forEach((label) => {
    insights.push({
      type: "warning",
      icon: GitMerge,
      text: `${label} are rising together — combined stress may accelerate wear. Check cooling and load balance.`,
    });
  });

  // ── Anomaly frequency trend ───────────────────────────────────────────────
  const anomFreqTrend = detectAnomalyFrequencyTrend(safe);
  if (anomFreqTrend === "increasing") {
    insights.push({
      type: "warning",
      icon: Zap,
      text: "Anomaly frequency is increasing over the current window — system behaviour is becoming less stable.",
    });
  } else if (anomFreqTrend === "decreasing") {
    insights.push({
      type: "info",
      icon: Zap,
      text: "Anomaly frequency is decreasing — system appears to be stabilising.",
    });
  }

  // ── Anomaly burst detection ───────────────────────────────────────────────
  const safeAnoms = anomalies || [];
  const sampleSize = safe.length;
  const anomRate =
    sampleSize > 0
      ? ((safeAnoms.slice(0, sampleSize).length / sampleSize) * 100).toFixed(1)
      : 0;

  if (safeAnoms.length >= 5) {
    const topScore = Math.max(
      ...safeAnoms.slice(0, 10).map((a) => a.anomaly_score || 0)
    );
    insights.push({
      type: "critical",
      icon: Zap,
      text: `High anomaly frequency: ${safeAnoms.length} recent anomalies (${anomRate}% rate, peak ${topScore.toFixed(2)}σ). Immediate investigation recommended.`,
    });
  } else if (safeAnoms.length >= 2) {
    insights.push({
      type: "warning",
      icon: Zap,
      text: `${safeAnoms.length} anomalies detected recently (${anomRate}% rate) — monitor sensor patterns.`,
    });
  } else if (safeAnoms.length === 1) {
    insights.push({
      type: "info",
      icon: AlertTriangle,
      text: "1 anomaly detected recently — isolated event. No action needed unless it recurs.",
    });
  }

  // ── Healthy fallback ──────────────────────────────────────────────────────
  if (insights.length === 0) {
    insights.push({
      type: "ok",
      icon: ThumbsUp,
      text: "All monitored metrics are within normal operating ranges. No anomalies detected.",
    });
  }

  return insights;
}

// ── Style map ─────────────────────────────────────────────────────────────────
const STYLES = {
  critical: {
    bar: "bg-red-500",
    wrap: "bg-red-50 border-red-100",
    text: "text-red-700",
    icon: "text-red-500",
  },
  warning: {
    bar: "bg-yellow-400",
    wrap: "bg-yellow-50 border-yellow-100",
    text: "text-yellow-700",
    icon: "text-yellow-500",
  },
  info: {
    bar: "bg-blue-400",
    wrap: "bg-blue-50 border-blue-100",
    text: "text-blue-700",
    icon: "text-blue-500",
  },
  ok: {
    bar: "bg-green-500",
    wrap: "bg-green-50 border-green-100",
    text: "text-green-700",
    icon: "text-green-500",
  },
};

function InsightRow({ insight }) {
  const s = STYLES[insight.type] || STYLES.info;
  const Icon = insight.icon;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${s.wrap}`}>
      <div className={`w-0.5 self-stretch rounded-full shrink-0 ${s.bar}`} />
      <Icon size={15} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <p className={`text-xs leading-relaxed ${s.text}`}>{insight.text}</p>
    </div>
  );
}

// ── Warm-up progress bar ──────────────────────────────────────────────────────
function WarmUpBar({ current, target }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Detector warming up…</span>
        <span>{current} / {target} samples</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIInsightPanel({
  telemetry = [],
  anomalies = [],
  anomalyStats = null,
  machineName = "Machine",
}) {
  const insights = useMemo(
    () => generateInsights(telemetry, anomalies, anomalyStats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [telemetry?.length, anomalies?.length, anomalyStats?.anomaly_count]
  );

  const latestScore = (telemetry || [])[0]?.anomaly_score ?? null;
  const totalAnomalies = anomalyStats?.anomaly_count ?? 0;
  const windowStats = anomalyStats?.detector_windows ?? {};
  const windowMetrics = Object.keys(windowStats);
  const minSamples = anomalyStats?.config?.min_samples ?? 15;
  const windowSize = anomalyStats?.config?.window_size ?? 60;
  const threshold = anomalyStats?.config?.anomaly_threshold ?? 2.8;

  const minCount =
    windowMetrics.length > 0
      ? Math.min(...windowMetrics.map((m) => windowStats[m]?.count ?? 0))
      : 0;
  const isWarmingUp = minCount < minSamples;

  const critCount = insights.filter((i) => i.type === "critical").length;
  const warnCount = insights.filter((i) => i.type === "warning").length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow p-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Brain size={18} className="text-indigo-500" />
          <span className="text-sm font-bold text-gray-700">AI Insights</span>
          <span className="text-xs text-gray-400">— {machineName}</span>
          {critCount > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {critCount} critical
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {warnCount} warning
            </span>
          )}
        </div>
        {latestScore != null && <AnomalyScorePill score={latestScore} />}
      </div>

      {/* ── Warm-up ────────────────────────────────────────────────────────── */}
      {isWarmingUp && <WarmUpBar current={minCount} target={minSamples} />}

      {/* ── Insights list ──────────────────────────────────────────────────── */}
      <div className="space-y-2 mb-5">
        {insights.length === 0 ? (
          <div className="text-xs text-gray-300 py-4 text-center">
            Collecting data for analysis…
          </div>
        ) : (
          insights.map((ins, i) => <InsightRow key={i} insight={ins} />)
        )}
      </div>

      {/* ── Anomaly frequency summary ───────────────────────────────────────── */}
      {totalAnomalies > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-orange-700">
            <Zap size={13} />
            <span className="font-medium">Anomaly history</span>
          </div>
          <span className="font-bold text-orange-700 tabular-nums">
            {totalAnomalies} total stored
          </span>
        </div>
      )}

      {/* ── Detector baselines ──────────────────────────────────────────────── */}
      {windowMetrics.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Detector Baselines
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {windowMetrics.map((metric) => {
              const w = windowStats[metric];
              return (
                <div
                  key={metric}
                  className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-xs"
                >
                  <p className="text-gray-500 capitalize font-medium mb-1 truncate">
                    {metric.replace("_", " ")}
                  </p>
                  <p className="font-mono text-gray-700">
                    μ {w.mean?.toFixed(2) ?? "—"}
                  </p>
                  <p className="font-mono text-gray-400">
                    σ {w.std?.toFixed(3) ?? "—"}
                  </p>
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-300 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((w.count || 0) / windowSize) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-gray-300 mt-0.5 tabular-nums">
                    {w.count}/{windowSize}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>
          Anomalies stored:{" "}
          <strong className="text-gray-600">{totalAnomalies}</strong>
        </span>
        <span>
          Threshold: <strong className="text-gray-600">{threshold}σ</strong>
        </span>
      </div>
    </div>
  );
}