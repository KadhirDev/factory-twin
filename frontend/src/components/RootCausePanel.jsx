/**
 * RootCausePanel
 *
 * Synthesises three evidence streams into a causal narrative:
 *   1. top_contributors  — which metrics deviated most (from ML anomaly_details)
 *   2. correlations      — which metric pairs were rising together
 *   3. metric trends     — direction of each signal at time of analysis
 *
 * Output: one primary cause statement + supporting evidence list.
 * Renders nothing when there is no recent anomaly to explain.
 */

import React, { useMemo } from "react";
import { Microscope, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useState } from "react";

// ── Metric display labels ──────────────────────────────────────────────────────
const METRIC_LABELS = {
  temperature:       "Temperature",
  vibration:         "Vibration",
  rpm:               "RPM",
  pressure:          "Pressure",
  power_consumption: "Power Consumption",
  oil_level:         "Oil Level",
};

// ── Causal relationship rules ──────────────────────────────────────────────────
// Each rule fires when specific metrics are among the top contributors AND
// optionally correlated with each other.
const CAUSAL_RULES = [
  {
    triggers:    ["temperature", "vibration"],
    primary:     "Thermal stress is elevating vibration.",
    detail:      "Rising temperature causes thermal expansion and bearing wear, which increases mechanical vibration.",
    confidence:  "high",
  },
  {
    triggers:    ["temperature", "power_consumption"],
    primary:     "Increased power draw is generating excess heat.",
    detail:      "Higher electrical load raises internal temperature. Inspect motor windings and cooling fans.",
    confidence:  "high",
  },
  {
    triggers:    ["rpm", "vibration"],
    primary:     "RPM instability is causing mechanical vibration.",
    detail:      "Uneven rotational speed creates resonance. Check rotor balance and shaft alignment.",
    confidence:  "high",
  },
  {
    triggers:    ["pressure", "power_consumption"],
    primary:     "Hydraulic resistance is increasing power demand.",
    detail:      "Elevated pressure from blockage or wear forces the pump to work harder.",
    confidence:  "medium",
  },
  {
    triggers:    ["temperature"],
    primary:     "Isolated temperature anomaly detected.",
    detail:      "No correlated metric confirms the cause. Check coolant flow and ambient conditions.",
    confidence:  "low",
  },
  {
    triggers:    ["vibration"],
    primary:     "Isolated vibration spike detected.",
    detail:      "Single-metric event. Could be transient load impact or mounting looseness.",
    confidence:  "low",
  },
  {
    triggers:    ["oil_level"],
    primary:     "Lubrication level is critically low.",
    detail:      "Low oil causes metal-to-metal friction, leading to elevated temperature and vibration.",
    confidence:  "high",
  },
  {
    triggers:    ["rpm"],
    primary:     "RPM deviation detected without correlated signals.",
    detail:      "Isolated speed change. Verify drive controller settings and load demand.",
    confidence:  "low",
  },
];

// ── Trend icon helper ─────────────────────────────────────────────────────────
function TrendIcon({ trend, size = 12 }) {
  if (trend === "rising")  return <TrendingUp  size={size} className="text-red-500"   />;
  if (trend === "falling") return <TrendingDown size={size} className="text-green-500" />;
  return <Minus size={size} className="text-gray-400" />;
}

// ── Confidence badge ──────────────────────────────────────────────────────────
const CONFIDENCE_STYLE = {
  high:   "bg-red-100 text-red-700 border-red-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  low:    "bg-gray-100 text-gray-500 border-gray-300",
};

// ── Root cause derivation ─────────────────────────────────────────────────────

/**
 * deriveRootCause
 *
 * Given:
 *   contributors — array of {metric, z_score, direction, label} from anomaly_details
 *   correlations — array of {a, b, label, implication} currently active
 *   trends       — {metric: "rising"|"falling"|"stable"} for each scored metric
 *
 * Returns a {primary, detail, confidence, evidence} object or null.
 */
function deriveRootCause(contributors = [], correlations = [], trends = {}) {
  if (!contributors.length) return null;

  // Build set of top deviating metrics (sorted by |z_score|)
  const topMetrics = contributors
    .slice()
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
    .map((c) => c.metric);

  // Find first matching causal rule
  // A rule matches if ALL its triggers appear in the top contributors
  let matchedRule = null;
  for (const rule of CAUSAL_RULES) {
    const allTriggersPresent = rule.triggers.every((t) => topMetrics.includes(t));
    if (allTriggersPresent) {
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) {
    // Fallback: generic description using top metric
    const top = contributors[0];
    matchedRule = {
      primary:    `${METRIC_LABELS[top.metric] ?? top.metric} is the primary anomaly driver.`,
      detail:     `This metric deviates ${Math.abs(top.z_score).toFixed(2)}σ from its baseline. No known correlated cause detected.`,
      confidence: "low",
    };
  }

  // Build evidence list
  const evidence = [];

  // Evidence 1: top contributors
  contributors.slice(0, 3).forEach((c) => {
    const absZ      = Math.abs(c.z_score);
    const direction = c.z_score > 0 ? "above" : "below";
    evidence.push({
      type:  "deviation",
      label: METRIC_LABELS[c.metric] ?? c.metric,
      text:  `${absZ.toFixed(2)}σ ${direction} baseline`,
      trend: trends[c.metric] ?? "stable",
      severity: absZ >= 4.0 ? "critical" : absZ >= 2.8 ? "warning" : "info",
    });
  });

  // Evidence 2: active correlations involving trigger metrics
  correlations.forEach((corr) => {
    const relevant =
      matchedRule.triggers?.includes(corr.a) ||
      matchedRule.triggers?.includes(corr.b);
    if (relevant) {
      evidence.push({
        type:  "correlation",
        label: corr.label,
        text:  "Both metrics rising simultaneously",
        trend: "rising",
        severity: "warning",
      });
    }
  });

  return {
    primary:    matchedRule.primary,
    detail:     matchedRule.detail,
    confidence: matchedRule.confidence,
    evidence,
  };
}

// ── Helper: extract current metric trends from telemetry ──────────────────────
function extractTrends(telemetry = []) {
  const METRICS = Object.keys(METRIC_LABELS);
  const trends  = {};

  METRICS.forEach((key) => {
    const values = (telemetry || [])
      .map((d) => d[key])
      .filter((v) => v != null)
      .reverse(); // oldest-first

    if (values.length < 6) {
      trends[key] = "stable";
      return;
    }
    const mid  = Math.floor(values.length / 2);
    const avg  = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const diff = avg(values.slice(mid)) - avg(values.slice(0, mid));
    const base = Math.abs(avg(values.slice(0, mid))) || 1;
    if (Math.abs(diff) / base > 0.03) {
      trends[key] = diff > 0 ? "rising" : "falling";
    } else {
      trends[key] = "stable";
    }
  });

  return trends;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RootCausePanel
 *
 * Props:
 *   anomalies    – TelemetryResponse[] anomalous readings (newest-first)
 *   correlations – active correlation pair objects (from parent)
 *   telemetry    – full telemetry window (for trend extraction)
 */
export default function RootCausePanel({ anomalies = [], correlations = [], telemetry = [] }) {
  const [expanded, setExpanded] = useState(false);

  const analysis = useMemo(() => {
    // Use the most recent anomaly that has top_contributors populated
    const recent = (anomalies || []).find(
      (a) => a.anomaly_details?.top_contributors?.length > 0
    );
    if (!recent) return null;

    const contributors = recent.anomaly_details.top_contributors;
    const trends       = extractTrends(telemetry);
    const timeAgo      = formatDistanceToNow(parseISO(recent.timestamp), { addSuffix: true });
    const cause        = deriveRootCause(contributors, correlations, trends);

    return { cause, timeAgo, score: recent.anomaly_score };
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    anomalies?.length,
    correlations?.length,
    telemetry?.length,
  ]);

  if (!analysis) return null;

  const { cause, timeAgo, score } = analysis;
  const confStyle = CONFIDENCE_STYLE[cause.confidence] || CONFIDENCE_STYLE.low;

  const EVIDENCE_SEVERITY_STYLE = {
    critical: "text-red-700 bg-red-50 border-red-200",
    warning:  "text-orange-700 bg-orange-50 border-orange-200",
    info:     "text-blue-700 bg-blue-50 border-blue-200",
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Microscope size={16} className="text-indigo-600 shrink-0" />
          <span className="text-sm font-bold text-indigo-800">Root Cause Analysis</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${confStyle}`}>
            {cause.confidence} confidence
          </span>
          <span className="text-xs text-indigo-400">{timeAgo}</span>
        </div>
      </div>

      {/* ── Primary cause statement ─────────────────────────────────────── */}
      <p className="text-sm font-semibold text-indigo-900 mb-1 leading-snug">
        {cause.primary}
      </p>
      <p className="text-xs text-indigo-700 mb-3 leading-relaxed">{cause.detail}</p>

      {/* ── Evidence list (collapsible) ─────────────────────────────────── */}
      {cause.evidence.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors mb-2"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Hide" : "Show"} supporting evidence ({cause.evidence.length})
          </button>

          {expanded && (
            <div className="space-y-1.5">
              {cause.evidence.map((ev, i) => {
                const sStyle = EVIDENCE_SEVERITY_STYLE[ev.severity] || EVIDENCE_SEVERITY_STYLE.info;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${sStyle}`}
                  >
                    <div className="flex items-center gap-2">
                      <TrendIcon trend={ev.trend} />
                      <span className="font-medium">{ev.label}</span>
                    </div>
                    <span className="font-mono opacity-80">{ev.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}