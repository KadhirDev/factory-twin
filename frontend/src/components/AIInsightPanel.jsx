import React, { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Brain,
  AlertTriangle,
  Zap,
  Droplets,
  ThumbsUp,
  GitMerge,
  Clock,
  ShieldAlert,
  Layers,
  Activity,
  Cpu,
  Timer,
  Flame,
  Link2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Gauge,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { AnomalyScorePill } from "./AnomalyBadge";
import { formatDistanceToNow, parseISO } from "date-fns";
import RootCausePanel from "./RootCausePanel";
import RecommendationCard from "./RecommendationCard";
import ConfidenceBadge from "./ConfidenceBadge";
import RiskMomentumBadge, { computeMomentumLevel } from "./RiskMomentumBadge";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_INTERVAL_S = 2;

const METRIC_CONFIG = {
  temperature: { label: "Temperature", unit: "°C", warn: 80, critical: 95, inverted: false },
  vibration: { label: "Vibration", unit: "", warn: 0.5, critical: 1.0, inverted: false },
  rpm: { label: "RPM", unit: " rpm", warn: 1800, critical: 2000, inverted: false },
  pressure: { label: "Pressure", unit: " bar", warn: 7.0, critical: 9.0, inverted: false },
  power_consumption: { label: "Power", unit: " kW", warn: 8.0, critical: 12, inverted: false },
  oil_level: { label: "Oil Level", unit: "%", warn: 20, critical: 10, inverted: true },
};

const CORRELATION_PAIRS = [
  {
    a: "temperature",
    b: "vibration",
    label: "Temperature & Vibration",
    implication: "Possible bearing overload — check lubrication.",
  },
  {
    a: "temperature",
    b: "power_consumption",
    label: "Temperature & Power",
    implication: "Thermal runaway risk — inspect cooling system.",
  },
  {
    a: "rpm",
    b: "vibration",
    label: "RPM & Vibration",
    implication: "Resonance frequency risk — reduce speed or balance rotor.",
  },
  {
    a: "pressure",
    b: "power_consumption",
    label: "Pressure & Power",
    implication: "Hydraulic stress — check seals and pump efficiency.",
  },
];

const SEVERITY = {
  critical: {
    min: 4.0,
    label: "Critical",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-500",
  },
  warning: {
    min: 2.8,
    label: "Warning",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    bar: "bg-orange-400",
  },
  elevated: {
    min: 1.5,
    label: "Elevated",
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    bar: "bg-yellow-400",
  },
  normal: {
    min: 0.0,
    label: "Normal",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    bar: "bg-green-400",
  },
};

function getSeverity(score) {
  if (score == null) return null;
  if (score >= SEVERITY.critical.min) return SEVERITY.critical;
  if (score >= SEVERITY.warning.min) return SEVERITY.warning;
  if (score >= SEVERITY.elevated.min) return SEVERITY.elevated;
  return SEVERITY.normal;
}

const CONFIDENCE_TAG_STYLE = {
  High: "bg-green-100 text-green-700 border-green-200",
  Moderate: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-gray-100 text-gray-500 border-gray-200",
};

const RISK_COLORS = {
  critical: { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  warning: { bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
  elevated: { bar: "bg-yellow-400", text: "text-yellow-700", bg: "bg-yellow-50" },
  normal: { bar: "bg-green-400", text: "text-green-700", bg: "bg-green-50" },
};

// ─────────────────────────────────────────────────────────────────────────────
// MATH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function linearSlope(values) {
  const n = values.length;
  if (n < 3) return 0;
  const slice = values.slice(-Math.min(n, 15));
  const m = slice.length;
  const xm = (m - 1) / 2;
  const ym = slice.reduce((a, b) => a + b, 0) / m;
  let num = 0;
  let den = 0;
  slice.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  return den !== 0 ? num / den : 0;
}

function etaMinutes(current, slope, threshold, inverted = false) {
  const heading = inverted
    ? slope < 0 && current > threshold
    : slope > 0 && current < threshold;
  if (!heading || Math.abs(slope) < 1e-6) return null;
  const steps = (threshold - current) / slope;
  if (steps <= 0) return null;
  const minutes = (steps * SAMPLE_INTERVAL_S) / 60;
  return minutes <= 120 ? Math.round(minutes) : null;
}

function detectTrend(values) {
  if (!values?.length || values.length < 6) return "stable";
  const mid = Math.floor(values.length / 2);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(values.slice(mid)) - avg(values.slice(0, mid));
  const base = Math.abs(avg(values.slice(0, mid))) || 1;
  if (Math.abs(diff) / base > 0.03) return diff > 0 ? "rising" : "falling";
  return "stable";
}

function computeETAs(telemetry = []) {
  const safe = telemetry || [];
  if (safe.length < 6) return [];
  const results = [];
  Object.entries(METRIC_CONFIG).forEach(([key, cfg]) => {
    const values = safe.map((d) => d[key]).filter((v) => v != null).reverse();
    if (values.length < 6) return;
    const current = values[values.length - 1];
    const slope = linearSlope(values);
    const etaWarn =
      cfg.warn != null ? etaMinutes(current, slope, cfg.warn, cfg.inverted) : null;
    const etaCrit =
      cfg.critical != null
        ? etaMinutes(current, slope, cfg.critical, cfg.inverted)
        : null;
    if (etaWarn == null && etaCrit == null) return;
    const lo = cfg.inverted ? cfg.critical : cfg.warn;
    const hi = cfg.inverted ? cfg.warn : cfg.critical;
    const fraction =
      hi && lo ? Math.min(1, Math.max(0, (current - lo) / (hi - lo))) : 0;
    const atWarn = cfg.inverted
      ? current <= (cfg.warn ?? Infinity)
      : current >= (cfg.warn ?? Infinity);
    const atCrit = cfg.inverted
      ? current <= (cfg.critical ?? -Infinity)
      : current >= (cfg.critical ?? Infinity);
    results.push({
      key,
      label: cfg.label,
      unit: cfg.unit,
      current,
      slope,
      etaWarn,
      etaCrit,
      atWarn,
      atCrit,
      fraction,
      inverted: cfg.inverted,
    });
  });
  return results.sort(
    (a, b) => (a.etaCrit ?? a.etaWarn ?? 999) - (b.etaCrit ?? b.etaWarn ?? 999)
  );
}

function detectCorrelations(telemetry = []) {
  const safe = telemetry || [];
  if (safe.length < 8) return [];
  return CORRELATION_PAIRS.filter(({ a, b }) => {
    const aV = safe.map((d) => d[a]).filter((v) => v != null).reverse();
    const bV = safe.map((d) => d[b]).filter((v) => v != null).reverse();
    return (
      aV.length >= 8 &&
      bV.length >= 8 &&
      detectTrend(aV) === "rising" &&
      detectTrend(bV) === "rising"
    );
  });
}

function computeAnomalyFrequency(telemetry = []) {
  const safe = (telemetry || []).filter((d) => d.is_anomaly != null);
  if (safe.length < 8) return null;
  const mid = Math.floor(safe.length / 2);
  const newer = safe.slice(0, mid);
  const older = safe.slice(mid);
  const newerCount = newer.filter((d) => d.is_anomaly).length;
  const olderCount = older.filter((d) => d.is_anomaly).length;
  const diff = newerCount / newer.length - olderCount / older.length;
  let trend = "stable";
  if (Math.abs(diff) >= 0.05) trend = diff > 0 ? "increasing" : "decreasing";
  const windowSeconds = safe.length * SAMPLE_INTERVAL_S;
  const totalAnomalies = safe.filter((d) => d.is_anomaly).length;
  const ratePerHour =
    windowSeconds > 0
      ? Math.round((totalAnomalies / windowSeconds) * 3600)
      : 0;
  return { ratePerHour, trend, recentCount: newerCount, olderCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE (ENHANCED)
// ─────────────────────────────────────────────────────────────────────────────

function computeConfidence(anomalyStats, activeCorrelations = [], currentETAs = []) {
  let score = 0;

  const trainedOn = anomalyStats?.config?.ml_trained_on ?? 0;
  const samplePts = Math.min(35, Math.round((trainedOn / 200) * 35));
  score += samplePts;

  const mlReady = anomalyStats?.config?.ml_model_ready ?? false;
  score += mlReady ? 25 : 10;

  const windowStats = anomalyStats?.detector_windows ?? {};
  const stds = Object.values(windowStats)
    .map((w) => w.std)
    .filter((v) => v != null && v > 0);
  const means = Object.values(windowStats)
    .map((w) => Math.abs(w.mean ?? 0))
    .filter((v) => v > 0.01);

  let varPts = 10;
  if (stds.length > 0 && means.length > 0) {
    const avgCV =
      (stds.reduce((a, b) => a + b, 0) / stds.length) /
      (means.reduce((a, b) => a + b, 0) / means.length);
    varPts = Math.max(5, Math.min(25, Math.round(25 - avgCV * 40)));
  }
  score += varPts;

  const scoreTrend = anomalyStats?.score_trend?.trend ?? "stable";
  score += scoreTrend === "stable" ? 15 : scoreTrend === "falling" ? 12 : 5;

  const anomalyCount = anomalyStats?.anomaly_count ?? 0;
  const consistencyPts =
    anomalyCount >= 10 ? 10 :
    anomalyCount >= 5 ? 6 :
    anomalyCount >= 2 ? 3 : 0;
  score += consistencyPts;

  const etaMetricSet = new Set((currentETAs || []).map((e) => e.key));
  const agreementCount = (activeCorrelations || []).filter(
    (c) => etaMetricSet.has(c.a) || etaMetricSet.has(c.b)
  ).length;
  score += Math.min(8, agreementCount * 4);

  const clamped = Math.min(100, Math.max(0, score));
  const label = clamped >= 66 ? "High" : clamped >= 36 ? "Moderate" : "Low";

  const detail =
    label === "High"
      ? `${trainedOn} training samples. Isolation Forest active. Baseline stable.${agreementCount > 0 ? " Correlation and ETA signals agree." : ""}`
      : label === "Moderate"
      ? `${trainedOn} training samples. ${mlReady ? "Isolation Forest active." : "Z-score fallback active."} Baseline still stabilising.`
      : `Only ${trainedOn} training samples. ${mlReady ? "" : "Z-score fallback active."} More data needed for reliable insights.`;

  return { score: clamped, label, detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK TREND + MOMENTUM
// ─────────────────────────────────────────────────────────────────────────────

function computeRiskMomentum(scoreTrendStr, etaItems, freqData) {
  let badSignals = 0;
  let goodSignals = 0;

  if (scoreTrendStr === "rising") badSignals++;
  else if (scoreTrendStr === "falling") goodSignals++;

  const critETAs = (etaItems || [])
    .filter((e) => e.etaCrit != null)
    .map((e) => e.etaCrit);
  const hasUrgentETA = critETAs.length > 0 && Math.min(...critETAs) <= 10;

  if (critETAs.length > 0) {
    const min = Math.min(...critETAs);
    if (min <= 15) badSignals++;
    else goodSignals += 0.5;
  }

  if (freqData?.trend === "increasing") badSignals++;
  else if (freqData?.trend === "decreasing") goodSignals++;

  const total = 3;
  const badRatio = badSignals / total;
  const goodRatio = goodSignals / total;
  const direction =
    badRatio >= 0.6 ? "worsening" :
    goodRatio >= 0.5 ? "improving" :
    "stable";

  return {
    direction,
    badCount: Math.ceil(badSignals),
    goodCount: Math.ceil(goodSignals),
    hasUrgentETA,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

function generateInsights(telemetry = [], anomalies = [], anomalyStats = null) {
  const insights = [];
  const safe = telemetry || [];
  if (!safe.length) return insights;

  Object.entries(METRIC_CONFIG).forEach(([key, cfg]) => {
    const values = safe.map((d) => d[key]).filter((v) => v != null).reverse();
    if (values.length < 4) return;
    const trend = detectTrend(values);
    const current = values[values.length - 1];
    const slope = linearSlope(values);

    if (cfg.inverted) {
      if (current <= (cfg.critical ?? 0)) {
        insights.push({
          type: "critical",
          icon: Droplets,
          priority: 1,
          text: `${cfg.label} critically low at ${current.toFixed(
            1
          )}${cfg.unit} — maintenance required immediately.`,
        });
      } else if (trend === "falling") {
        const eta = etaMinutes(current, slope, cfg.warn, true);
        const hint = eta != null ? ` Warning threshold in ~${eta} min.` : "";
        insights.push({
          type: "warning",
          icon: TrendingDown,
          priority: 3,
          text: `${cfg.label} trending down (${current.toFixed(
            1
          )}${cfg.unit}).${hint}`,
        });
      }
      return;
    }

    const atCrit = cfg.critical && current >= cfg.critical;
    const atWarn = cfg.warn && current >= cfg.warn;
    const nearWarn = cfg.warn && current >= cfg.warn * 0.82;

    if (atCrit) {
      insights.push({
        type: "critical",
        icon: AlertTriangle,
        priority: 1,
        text: `${cfg.label} at ${current.toFixed(
          1
        )}${cfg.unit} — critical threshold exceeded.`,
      });
    } else if (atWarn && trend === "rising") {
      const eta = etaMinutes(current, slope, cfg.critical);
      const hint = eta != null ? ` Critical in ~${eta} min.` : "";
      insights.push({
        type: "warning",
        icon: TrendingUp,
        priority: 2,
        text: `${cfg.label} at warning level and rising (${current.toFixed(
          1
        )}${cfg.unit}).${hint}`,
      });
    } else if (!atWarn && nearWarn && trend === "rising") {
      const eta = etaMinutes(current, slope, cfg.warn);
      const hint = eta != null ? ` Warning threshold in ~${eta} min.` : "";
      insights.push({
        type: "info",
        icon: Clock,
        priority: 5,
        text: `${cfg.label} approaching warning threshold (${current.toFixed(
          1
        )}${cfg.unit}).${hint}`,
      });
    } else if (key === "rpm" && trend === "falling") {
      insights.push({
        type: "info",
        icon: TrendingDown,
        priority: 8,
        text: `RPM decreasing — possible load reduction (${current.toFixed(
          0
        )} rpm).`,
      });
    }
  });

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
      priority: 2,
      text: `High anomaly rate: ${safeAnoms.length} recent anomalies (${anomRate}%, peak ${topScore.toFixed(
        2
      )}σ).`,
    });
  } else if (safeAnoms.length >= 2) {
    insights.push({
      type: "warning",
      icon: Zap,
      priority: 4,
      text: `${safeAnoms.length} anomalies recently (${anomRate}%) — monitor sensor patterns.`,
    });
  } else if (safeAnoms.length === 1) {
    insights.push({
      type: "info",
      icon: AlertTriangle,
      priority: 7,
      text: "1 anomaly detected recently — isolated event, monitor for recurrence.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "ok",
      icon: ThumbsUp,
      priority: 99,
      text: "All metrics within normal operating ranges. No anomalies detected.",
    });
  }
  return insights;
}

function addConfidenceToInsights(insights = [], sampleCount = 0, mlReady = false) {
  return insights.map((insight) => {
    let confidence;
    if (insight.type === "critical") {
      confidence = "High";
    } else if (insight.type === "warning") {
      confidence =
        insight.text.includes("trending") || insight.text.includes("approaching")
          ? "Moderate"
          : "High";
    } else if (insight.type === "info") {
      confidence = sampleCount >= 100 && mlReady ? "Moderate" : "Low";
    } else {
      confidence = sampleCount >= 50 ? "Moderate" : "Low";
    }
    return { ...insight, confidence };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK INDEX
// ─────────────────────────────────────────────────────────────────────────────

function computeRiskIndex(anomalyScore, freqData, etaItems) {
  const scoreComponent =
    anomalyScore != null ? Math.min(40, Math.round((anomalyScore / 8) * 40)) : 0;
  let freqComponent = 0;
  if (freqData) {
    if (freqData.trend === "increasing") freqComponent = 30;
    else if (freqData.trend === "stable" && freqData.ratePerHour > 0) freqComponent = 10;
  }
  let etaComponent = 0;
  const critETAs = (etaItems || []).map((e) => e.etaCrit).filter((v) => v != null);
  if (critETAs.length > 0) {
    const min = Math.min(...critETAs);
    if (min <= 5) etaComponent = 30;
    else if (min <= 15) etaComponent = 20;
    else if (min <= 30) etaComponent = 10;
  }
  const index = Math.min(100, scoreComponent + freqComponent + etaComponent);
  const level =
    index >= 70 ? "critical" :
    index >= 40 ? "warning" :
    index >= 20 ? "elevated" :
    "normal";
  return {
    index,
    breakdown: {
      anomalyScore: scoreComponent,
      frequency: freqComponent,
      etaUrgency: etaComponent,
    },
    level,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function InsightRow({ insight }) {
  const STYLES = {
    critical: { bar: "bg-red-500", wrap: "bg-red-50 border-red-100", text: "text-red-700", icon: "text-red-500" },
    warning: { bar: "bg-yellow-400", wrap: "bg-yellow-50 border-yellow-100", text: "text-yellow-700", icon: "text-yellow-500" },
    info: { bar: "bg-blue-400", wrap: "bg-blue-50 border-blue-100", text: "text-blue-700", icon: "text-blue-500" },
    ok: { bar: "bg-green-500", wrap: "bg-green-50 border-green-100", text: "text-green-700", icon: "text-green-500" },
  };
  const s = STYLES[insight.type] || STYLES.info;
  const Icon = insight.icon;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${s.wrap}`}>
      <div className={`w-0.5 self-stretch rounded-full shrink-0 ${s.bar}`} />
      <Icon size={15} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-relaxed ${s.text}`}>{insight.text}</p>
        {insight.confidence && (
          <span
            className={`mt-1.5 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              CONFIDENCE_TAG_STYLE[insight.confidence] || CONFIDENCE_TAG_STYLE.Low
            }`}
          >
            {insight.confidence} confidence
          </span>
        )}
      </div>
    </div>
  );
}

function WarmUpBar({ current, target }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Detector warming up…</span><span>{current} / {target} samples</span>
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

function DetectorBadge({ detectorType, mlModelReady }) {
  const isML = detectorType === "isolation_forest" || mlModelReady;
  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border
      ${isML ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}
    >
      <Cpu size={11} />
      {isML ? "Isolation Forest" : "Z-Score (warming up)"}
    </div>
  );
}

function SeverityBadge({ score }) {
  const sev = getSeverity(score);
  if (!sev) return null;
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${sev.bg} ${sev.color} ${sev.border}`}>
      {sev.label}
    </span>
  );
}

function TopRiskyMetric({ telemetry }) {
  const latest = (telemetry || [])[0];
  if (!latest) return null;
  let topMetric = null, topPct = 0;
  Object.entries(METRIC_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.critical) return;
    const val = latest[key];
    if (val == null) return;
    const pct = cfg.inverted
      ? Math.max(0, (1 - val / cfg.critical) * 100)
      : (val / cfg.critical) * 100;
    if (pct > topPct) {
      topPct = pct;
      topMetric = { key, cfg, val, pct: Math.round(pct) };
    }
  });
  if (!topMetric) return null;

  const barColor =
    topMetric.pct >= 100 ? "bg-red-500" : topMetric.pct >= 85 ? "bg-yellow-400" : "bg-blue-400";
  const textColor =
    topMetric.pct >= 100 ? "text-red-700" : topMetric.pct >= 85 ? "text-yellow-700" : "text-blue-700";

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className={textColor} />
          <span className="text-xs font-semibold text-gray-600">Top Risk Metric</span>
        </div>
        <span className={`text-xs font-bold ${textColor}`}>
          {topMetric.cfg.label}: {topMetric.val.toFixed(2)}{topMetric.cfg.unit}
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(topMetric.pct, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1 text-right">{topMetric.pct}% of critical threshold</p>
    </div>
  );
}

function AnomalyClusters({ anomalies }) {
  const clusters = useMemo(() => {
    const safe = (anomalies || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!safe.length) return [];
    const result = [];
    let current = [safe[0]];
    for (let i = 1; i < safe.length; i++) {
      const gap = new Date(safe[i].timestamp) - new Date(safe[i - 1].timestamp);
      if (gap <= 30_000) {
        current.push(safe[i]);
      } else {
        result.push(current);
        current = [safe[i]];
      }
    }
    result.push(current);
    return result.reverse();
  }, [anomalies]);
  if (!clusters.length) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Layers size={13} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Anomaly Clusters ({clusters.length})
        </p>
      </div>
      <div className="space-y-1.5">
        {clusters.slice(0, 4).map((cluster, i) => {
          const latest = cluster[cluster.length - 1];
          const topScore = Math.max(...cluster.map((a) => a.anomaly_score || 0));
          const timeAgo = formatDistanceToNow(parseISO(latest.timestamp), { addSuffix: true });
          return (
            <div
              key={i}
              className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${topScore >= 4 ? "bg-red-500" : "bg-orange-400"}`}
                />
                <span className="text-orange-700 font-medium">
                  {cluster.length === 1 ? "1 reading" : `${cluster.length} readings`}
                </span>
              </div>
              <div className="flex items-center gap-3 text-orange-500">
                <span className="font-mono">peak {topScore.toFixed(2)}σ</span>
                <span className="text-orange-300">{timeAgo}</span>
              </div>
            </div>
          );
        })}
        {clusters.length > 4 && (
          <p className="text-xs text-gray-400 pl-1">
            +{clusters.length - 4} more cluster{clusters.length - 4 !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreTrendPanel({ scoreTrend }) {
  if (!scoreTrend || !scoreTrend.scores?.length) return null;
  const { trend, recent_avg, peak_score, scores } = scoreTrend;
  const chartData = scores.map((v, i) => ({ i, v }));
  const trendColor =
    trend === "rising" ? "text-red-600" : trend === "falling" ? "text-green-600" : "text-gray-500";
  const lineColor =
    trend === "rising" ? "#ef4444" : trend === "falling" ? "#10b981" : "#6b7280";
  const TrendIcon =
    trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : Activity;
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">Anomaly Score Trend</span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon size={12} /><span className="capitalize">{trend}</span>
        </div>
      </div>
      <div className="h-10 mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <RechartsTooltip
              formatter={(v) => [v?.toFixed(3) + "σ", "score"]}
              contentStyle={{ fontSize: 10, padding: "2px 6px", borderRadius: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between text-xs text-gray-400 font-mono">
        <span>avg {recent_avg != null ? recent_avg.toFixed(3) : "—"}σ</span>
        <span>peak {peak_score != null ? peak_score.toFixed(3) : "—"}σ</span>
      </div>
    </div>
  );
}

function FeatureContributors({ anomalies = [] }) {
  const recent = (anomalies || []).find((a) => a.anomaly_details?.top_contributors?.length > 0);
  if (!recent) return null;
  const contributors = recent.anomaly_details.top_contributors;
  const timeAgo = formatDistanceToNow(parseISO(recent.timestamp), { addSuffix: true });

  return (
    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-orange-500" />
          <span className="text-xs font-semibold text-orange-700">Last Anomaly — Contributing Factors</span>
        </div>
        <span className="text-xs text-orange-300">{timeAgo}</span>
      </div>
      <div className="space-y-1.5">
        {contributors.map((c, i) => {
          const absZ = Math.abs(c.z_score);
          const barPct = Math.min(100, (absZ / 5.0) * 100);
          const barCol =
            absZ >= 4.0 ? "bg-red-500" : absZ >= 2.8 ? "bg-orange-400" : "bg-yellow-300";
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium text-orange-800">{c.label}</span>
                <span className={`font-mono text-xs ${absZ >= 4.0 ? "text-red-700" : "text-orange-600"}`}>
                  {c.z_score > 0 ? "+" : ""}{c.z_score.toFixed(2)}σ
                </span>
              </div>
              <div className="h-1 bg-orange-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barCol}`} style={{ width: `${barPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {contributors[0]?.description && (
        <p className="text-xs text-orange-400 mt-2 italic">{contributors[0].description}</p>
      )}
    </div>
  );
}

function PredictiveETAPanel({ etas }) {
  if (!etas?.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Timer size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Predictive Failure Estimation
        </span>
      </div>
      <div className="space-y-2">
        {etas.map((eta) => {
          const urgency = eta.atCrit ? "critical" : eta.atWarn ? "warning" : "info";
          const u = {
            critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", fill: "bg-red-500", icon: Flame },
            warning: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", fill: "bg-orange-400", icon: AlertTriangle },
            info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", fill: "bg-blue-400", icon: Timer },
          }[urgency];
          const Icon = u.icon;
          const barPct = Math.min(100, Math.max(0, eta.fraction * 100));

          return (
            <div key={eta.key} className={`rounded-lg border p-3 ${u.bg} ${u.border}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Icon size={13} className={u.text} />
                  <span className={`text-xs font-semibold ${u.text}`}>{eta.label}</span>
                </div>
                <span className={`text-xs font-mono font-bold tabular-nums ${u.text}`}>
                  {eta.current.toFixed(2)}{eta.unit}
                </span>
              </div>
              <div className="h-1.5 bg-white rounded-full overflow-hidden border border-gray-100 mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${u.fill}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {eta.etaWarn != null && !eta.atWarn && (
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-2 py-0.5 font-medium">
                    <Clock size={10} />Warning in ~{eta.etaWarn} min
                  </span>
                )}
                {eta.etaCrit != null && (
                  <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded-full px-2 py-0.5 font-medium">
                    <Flame size={10} />Critical in ~{eta.etaCrit} min
                  </span>
                )}
                {eta.atWarn && !eta.atCrit && (
                  <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 rounded-full px-2 py-0.5 font-medium">
                    <AlertTriangle size={10} />At warning level
                  </span>
                )}
                {eta.atCrit && (
                  <span className="inline-flex items-center gap-1 text-xs bg-red-200 text-red-800 border border-red-400 rounded-full px-2 py-0.5 font-bold">
                    <Flame size={10} />Critical threshold exceeded
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CorrelationPanel({ correlations }) {
  if (!correlations?.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Link2 size={14} className="text-purple-500" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Correlated Metric Pairs
        </span>
        <span className="text-xs text-gray-400">({correlations.length} detected)</span>
      </div>
      <div className="space-y-2">
        {correlations.map((pair, i) => (
          <div key={i} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="flex items-start gap-2 mb-1">
              <GitMerge size={13} className="text-purple-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <TrendingUp size={9} />{METRIC_CONFIG[pair.a]?.label ?? pair.a}
                  </span>
                  <span className="text-xs text-purple-400">+</span>
                  <span className="text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <TrendingUp size={9} />{METRIC_CONFIG[pair.b]?.label ?? pair.b}
                  </span>
                  <span className="text-xs font-bold text-purple-600 ml-auto">Both Rising</span>
                </div>
                <p className="text-xs text-purple-700 italic">{pair.implication}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnomalyFrequencyPanel({ telemetry }) {
  const freq = useMemo(() => computeAnomalyFrequency(telemetry), [telemetry]);
  if (!freq || (freq.ratePerHour === 0 && freq.recentCount === 0)) return null;

  const trendColor =
    freq.trend === "increasing" ? "text-red-600" : freq.trend === "decreasing" ? "text-green-600" : "text-gray-500";
  const TrendIcon =
    freq.trend === "increasing" ? TrendingUp : freq.trend === "decreasing" ? TrendingDown : Activity;
  const bgClass =
    freq.trend === "increasing" ? "bg-red-50 border-red-200" : freq.trend === "decreasing" ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200";
  return (
    <div className={`rounded-lg border p-3 mb-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className={trendColor} />
          <span className="text-xs font-semibold text-gray-600">Anomaly Frequency</span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold ${trendColor}`}>
          <TrendIcon size={12} /><span className="capitalize">{freq.trend}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="text-center">
          <p className={`text-2xl font-bold tabular-nums ${trendColor}`}>{freq.ratePerHour}</p>
          <p className="text-gray-400 text-[10px]">events/hr</p>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div className="flex gap-4 text-xs text-gray-500">
          <div><span className="font-medium text-gray-700">{freq.recentCount}</span><span className="ml-1">recent half</span></div>
          <div><span className="font-medium text-gray-700">{freq.olderCount}</span><span className="ml-1">older half</span></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2 italic">
        {freq.trend === "increasing"
          ? "Anomaly events are becoming more frequent — system instability may be worsening."
          : freq.trend === "decreasing"
          ? "Anomaly events are reducing — system appears to be stabilising."
          : "Anomaly frequency is stable."}
      </p>
    </div>
  );
}

function RiskIndexBar({ riskData, momentum }) {
  if (!riskData) return null;
  const { index, breakdown, level } = riskData;
  const rc = RISK_COLORS[level] || RISK_COLORS.normal;
  const momentumLevel = momentum ? computeMomentumLevel(momentum) : null;

  return (
    <div className={`rounded-xl border p-4 mb-4 ${rc.bg}`} style={{ borderColor: "#e5e7eb" }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge size={15} className={rc.text} />
          <span className={`text-sm font-bold ${rc.text}`}>Risk Index</span>
        </div>
        <div className="flex items-center gap-2">
          {momentum && (
            <RiskMomentumBadge
              direction={momentum.direction}
              level={momentumLevel}
              badCount={momentum.badCount}
              goodCount={momentum.goodCount}
              hasUrgentETA={momentum.hasUrgentETA}
            />
          )}
          <span className={`text-2xl font-black tabular-nums ${rc.text}`}>{index}</span>
        </div>
      </div>
      <div className="h-3 bg-white rounded-full overflow-hidden border border-gray-100 mb-2 flex">
        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${breakdown.anomalyScore}%` }} />
        <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${breakdown.frequency}%` }} />
        <div className="h-full bg-yellow-400 transition-all duration-500" style={{ width: `${breakdown.etaUrgency}%` }} />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Score ({breakdown.anomalyScore}pts)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Frequency ({breakdown.frequency}pts)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />ETA ({breakdown.etaUrgency}pts)</span>
      </div>
    </div>
  );
}

const DEFAULT_VISIBLE = 3;
const TYPE_WEIGHT = { critical: 0, warning: 1, info: 2, ok: 3 };
const CONFIDENCE_WEIGHT = { High: 0, Moderate: 1, Low: 2 };

function PriorityInsights({ insights, riskIndex = 0 }) {
  const [expanded, setExpanded] = useState(false);
  if (!insights?.length) return null;

  const sorted = [...insights].sort((a, b) => {
    const ta = TYPE_WEIGHT[a.type] ?? 2;
    const tb = TYPE_WEIGHT[b.type] ?? 2;
    if (ta !== tb) return ta - tb;

    const pa = a.priority ?? 50;
    const pb = b.priority ?? 50;
    if (pa !== pb) return pa - pb;

    const ca = CONFIDENCE_WEIGHT[a.confidence] ?? 2;
    const cb = CONFIDENCE_WEIGHT[b.confidence] ?? 2;
    return ca - cb;
  });

  const filtered = sorted.filter((insight) => {
    if (riskIndex < 20 && insight.confidence === "Low" && (insight.type === "info" || insight.type === "ok")) {
      return false;
    }
    return true;
  });

  const displayList = filtered.length > 0 ? filtered : sorted.slice(0, 1);
  const visible = expanded ? displayList : displayList.slice(0, DEFAULT_VISIBLE);
  const hidden = displayList.length - DEFAULT_VISIBLE;
  const suppressed = sorted.length - displayList.length;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Signal Insights</span>
        </div>
        <div className="flex items-center gap-2">
          {suppressed > 0 && (
            <span className="text-[10px] text-gray-400 italic">
              {suppressed} low-priority suppressed
            </span>
          )}
          {displayList.length > DEFAULT_VISIBLE && (
            <span className="text-xs text-gray-400">{displayList.length} total</span>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {visible.map((ins, i) => <InsightRow key={i} insight={ins} />)}
      </div>
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
        >
          <ChevronDown size={13} />Show {hidden} more insight{hidden !== 1 ? "s" : ""}
        </button>
      )}
      {expanded && displayList.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
        >
          <ChevronUp size={13} />Show fewer
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AIInsightPanel({
  telemetry = [],
  anomalies = [],
  anomalyStats = null,
  machineName = "Machine",
}) {
  const activeCorrelations = useMemo(
    () => detectCorrelations(telemetry),
    [telemetry?.length]
  );

  const currentETAs = useMemo(
    () => computeETAs(telemetry),
    [telemetry?.length]
  );

  const freqData = useMemo(
    () => computeAnomalyFrequency(telemetry),
    [telemetry?.length]
  );

  const confidenceData = useMemo(
    () => computeConfidence(anomalyStats, activeCorrelations, currentETAs),
    [
      anomalyStats?.config?.ml_trained_on,
      anomalyStats?.config?.ml_model_ready,
      anomalyStats?.score_trend?.trend,
      anomalyStats?.anomaly_count,
      activeCorrelations?.length,
      currentETAs?.length,
    ]
  );

  const momentumData = useMemo(
    () =>
      computeRiskMomentum(
        anomalyStats?.score_trend?.trend ?? null,
        currentETAs,
        freqData
      ),
    [anomalyStats?.score_trend?.trend, currentETAs?.length, freqData?.trend]
  );

  const rawInsights = useMemo(
    () => generateInsights(telemetry, anomalies, anomalyStats),
    [telemetry?.length, anomalies?.length, anomalyStats?.anomaly_count]
  );

  const insights = useMemo(
    () =>
      addConfidenceToInsights(
        rawInsights,
        anomalyStats?.config?.ml_trained_on ?? 0,
        anomalyStats?.config?.ml_model_ready ?? false
      ),
    [rawInsights, anomalyStats?.config?.ml_trained_on, anomalyStats?.config?.ml_model_ready]
  );

  const latestScore = (telemetry || [])[0]?.anomaly_score ?? null;
  const riskData = useMemo(
    () => computeRiskIndex(latestScore, freqData, currentETAs),
    [latestScore, freqData?.trend, currentETAs?.length]
  );

  const totalAnomalies = anomalyStats?.anomaly_count ?? 0;
  const windowStats = anomalyStats?.detector_windows ?? {};
  const windowMetrics = Object.keys(windowStats);
  const minSamples = anomalyStats?.config?.min_samples ?? 50;
  const windowSize = anomalyStats?.config?.window_size ?? 50;
  const threshold = anomalyStats?.config?.anomaly_threshold ?? 2.8;
  const detectorType = anomalyStats?.config?.detector_type ?? "z_score";
  const mlModelReady = anomalyStats?.config?.ml_model_ready ?? false;
  const scoreTrend = anomalyStats?.score_trend ?? null;

  const minCount = windowMetrics.length > 0
    ? Math.min(...windowMetrics.map((m) => windowStats[m]?.count ?? 0))
    : 0;
  const isWarmingUp = minCount < minSamples;

  const critCount = insights.filter((i) => i.type === "critical").length;
  const warnCount = insights.filter((i) => i.type === "warning").length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow p-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
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
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge score={latestScore} />
          <DetectorBadge detectorType={detectorType} mlModelReady={mlModelReady} />
          {latestScore != null && <AnomalyScorePill score={latestScore} />}
        </div>
      </div>

      {isWarmingUp && <WarmUpBar current={minCount} target={minSamples} />}

      <div className="mb-4">
        <ConfidenceBadge
          score={confidenceData.score}
          label={confidenceData.label}
          detail={confidenceData.detail}
        />
      </div>

      <RiskIndexBar riskData={riskData} momentum={momentumData} />

      <RootCausePanel
        anomalies={anomalies}
        correlations={activeCorrelations}
        telemetry={telemetry}
        confidence={confidenceData}
      />

      <RecommendationCard
        telemetry={telemetry}
        correlations={activeCorrelations}
        etaItems={currentETAs}
        anomalyScore={latestScore}
        confidence={confidenceData}
      />

      <PredictiveETAPanel etas={currentETAs} />

      <CorrelationPanel correlations={activeCorrelations} />

      <AnomalyFrequencyPanel telemetry={telemetry} />

      <ScoreTrendPanel scoreTrend={scoreTrend} />

      <TopRiskyMetric telemetry={telemetry} />

      <FeatureContributors anomalies={anomalies} />

      <PriorityInsights insights={insights} riskIndex={riskData?.index ?? 0} />

      {(anomalies || []).length > 0 && <AnomalyClusters anomalies={anomalies} />}

      {totalAnomalies > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-orange-700">
            <Zap size={13} />
            <span className="font-medium">Anomaly history</span>
          </div>
          <span className="font-bold text-orange-700 tabular-nums">{totalAnomalies} total stored</span>
        </div>
      )}

      {windowMetrics.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Detector Baselines
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {windowMetrics.map((metric) => {
              const w = windowStats[metric];
              return (
                <div key={metric} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-xs">
                  <p className="text-gray-500 capitalize font-medium mb-1 truncate">
                    {metric.replace("_", " ")}
                  </p>
                  <p className="font-mono text-gray-700">μ {w.mean?.toFixed(2) ?? "—"}</p>
                  <p className="font-mono text-gray-400">σ {w.std?.toFixed(3) ?? "—"}</p>
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-300 rounded-full"
                      style={{ width: `${Math.min(100, ((w.count || 0) / windowSize) * 100)}%` }}
                    />
                  </div>
                  <p className="text-gray-300 mt-0.5 tabular-nums">{w.count}/{windowSize}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>Anomalies stored: <strong className="text-gray-600">{totalAnomalies}</strong></span>
        <span>Threshold: <strong className="text-gray-600">{threshold}σ</strong></span>
      </div>
    </div>
  );
}