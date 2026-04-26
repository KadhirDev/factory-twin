/**
 * RootCausePanel
 *
 * Two rendering paths:
 *
 * PATH A (ML-backed): Fires when a stored anomaly record with `top_contributors`
 * exists. Shows ranked causal analysis with match scores, alternative causes,
 * and collapsible evidence. Styled indigo.
 *
 * PATH B (Live-data fallback): Fires when no stored ML anomaly exists but live
 * metric values cross defined thresholds. Derived from current sensor readings.
 * Styled amber to visually distinguish from ML-backed analysis.
 *
 * PATH A takes priority over PATH B. Both return null if no cause can be derived.
 *
 * Null safety: timestamp parsing is wrapped in try/catch throughout.
 */

import React, { useMemo, useState } from "react";
import {
  Microscope,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

// ── Metric display labels ─────────────────────────────────────────────────────
const METRIC_LABELS = {
  temperature:       "Temperature",
  vibration:         "Vibration",
  rpm:               "RPM",
  pressure:          "Pressure",
  power_consumption: "Power Consumption",
  oil_level:         "Oil Level",
};

// ── Causal rules (PATH A — ML-backed) ────────────────────────────────────────
const CAUSAL_RULES = [
  {
    id:       "temp_vibration",
    triggers: ["temperature", "vibration"],
    primary:  "Thermal stress is elevating vibration.",
    detail:   "Rising temperature causes thermal expansion and bearing wear, directly increasing mechanical vibration.",
    baseConf: "high",
  },
  {
    id:       "temp_power",
    triggers: ["temperature", "power_consumption"],
    primary:  "Increased power draw is generating excess heat.",
    detail:   "Higher electrical load raises internal temperature. Inspect motor windings and cooling fans.",
    baseConf: "high",
  },
  {
    id:       "rpm_vibration",
    triggers: ["rpm", "vibration"],
    primary:  "RPM instability is causing mechanical vibration.",
    detail:   "Uneven rotational speed creates resonance. Check rotor balance and shaft alignment.",
    baseConf: "high",
  },
  {
    id:       "pressure_power",
    triggers: ["pressure", "power_consumption"],
    primary:  "Hydraulic resistance is increasing power demand.",
    detail:   "Elevated pressure from blockage or wear forces the pump to work harder.",
    baseConf: "medium",
  },
  {
    id:       "oil_level",
    triggers: ["oil_level"],
    primary:  "Lubrication level is critically low.",
    detail:   "Low oil causes metal-to-metal friction, leading to elevated temperature and vibration.",
    baseConf: "high",
  },
  {
    id:       "temp_only",
    triggers: ["temperature"],
    primary:  "Isolated temperature anomaly detected.",
    detail:   "No correlated metric confirms the cause. Check coolant flow and ambient conditions.",
    baseConf: "low",
  },
  {
    id:       "vib_only",
    triggers: ["vibration"],
    primary:  "Isolated vibration spike detected.",
    detail:   "Single-metric event. Could be transient load impact or mounting looseness.",
    baseConf: "low",
  },
  {
    id:       "rpm_only",
    triggers: ["rpm"],
    primary:  "RPM deviation detected without correlated signals.",
    detail:   "Isolated speed change. Verify drive controller settings and load demand.",
    baseConf: "low",
  },
];

// ── Live threshold rules (PATH B — live-data fallback) ────────────────────────
const LIVE_THRESHOLDS = [
  {
    key: "temperature", label: "Temperature", unit: "°C",
    warn: 80, critical: 95, inverted: false,
    cause:  "Temperature is exceeding the safe operating threshold.",
    detail: "High temperature may indicate cooling failure, excessive load, or restricted airflow around the machine.",
  },
  {
    key: "vibration", label: "Vibration", unit: "",
    warn: 0.5, critical: 1.0, inverted: false,
    cause:  "Mechanical vibration exceeds the safe operating level.",
    detail: "Elevated vibration suggests bearing wear, shaft imbalance, or structural resonance in rotating components.",
  },
  {
    key: "rpm", label: "RPM", unit: " rpm",
    warn: 1800, critical: 2000, inverted: false,
    cause:  "Rotational speed has exceeded the rated operating limit.",
    detail: "Over-speed places excess stress on seals, bearings, and drive components beyond their design specification.",
  },
  {
    key: "pressure", label: "Pressure", unit: " bar",
    warn: 7.0, critical: 9.0, inverted: false,
    cause:  "Hydraulic pressure is above the normal operating range.",
    detail: "Elevated pressure indicates blockage, pump wear, or increased flow resistance in the hydraulic circuit.",
  },
  {
    key: "power_consumption", label: "Power", unit: " kW",
    warn: 8.0, critical: 12, inverted: false,
    cause:  "Electrical power draw is above the rated machine capacity.",
    detail: "Excessive current load accelerates winding degradation and will eventually trip thermal protection.",
  },
  {
    key: "oil_level", label: "Oil Level", unit: "%",
    warn: 20, critical: 10, inverted: true,
    cause:  "Lubrication level is dangerously low.",
    detail: "Insufficient oil causes metal-to-metal contact in bearings, rapidly increasing temperature and component wear.",
  },
];

// ── Style maps ────────────────────────────────────────────────────────────────
const CAUSE_CONFIDENCE_STYLE = {
  high:   "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low:    "bg-gray-100 text-gray-600 border-gray-300",
};

const EVIDENCE_STYLE = {
  critical: "text-red-700 bg-red-50 border-red-200",
  warning:  "text-orange-700 bg-orange-50 border-orange-200",
  info:     "text-blue-700 bg-blue-50 border-blue-200",
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function TrendIcon({ trend, size = 12 }) {
  if (trend === "rising")  return <TrendingUp  size={size} className="text-red-500"   />;
  if (trend === "falling") return <TrendingDown size={size} className="text-green-500" />;
  return <Minus size={size} className="text-gray-400" />;
}

/**
 * Safe time-ago string from an ISO timestamp string.
 * Returns "recently" if the timestamp is missing or unparseable.
 */
function safeTimeAgo(timestamp) {
  if (!timestamp) return "recently";
  try {
    return formatDistanceToNow(parseISO(timestamp), { addSuffix: true });
  } catch {
    return "recently";
  }
}

function extractTrends(telemetry = []) {
  const trends = {};
  Object.keys(METRIC_LABELS).forEach((key) => {
    const values = (telemetry || [])
      .map((d) => d[key])
      .filter((v) => v != null)
      .reverse();
    if (values.length < 6) { trends[key] = "stable"; return; }
    const mid  = Math.floor(values.length / 2);
    const avg  = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const diff = avg(values.slice(mid)) - avg(values.slice(0, mid));
    const base = Math.abs(avg(values.slice(0, mid))) || 1;
    trends[key] = Math.abs(diff) / base > 0.03
      ? diff > 0 ? "rising" : "falling"
      : "stable";
  });
  return trends;
}

// ── PATH A logic ──────────────────────────────────────────────────────────────

function rankCauses(contributors = [], correlations = [], trends = {}) {
  if (!contributors.length) return [];

  const topMetrics   = contributors
    .slice()
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
    .map((c) => c.metric);
  const topMetricSet = new Set(topMetrics);
  const contribMap   = Object.fromEntries(contributors.map((c) => [c.metric, Math.abs(c.z_score)]));
  const corrPairSet  = new Set(
    (correlations || []).map((c) => [c.a, c.b].sort().join("+"))
  );

  const scored = CAUSAL_RULES.map((rule) => {
    const matchedTriggers = rule.triggers.filter((t) => topMetricSet.has(t));
    if (!matchedTriggers.length) return null;

    const triggerPts   = (matchedTriggers.length / rule.triggers.length) * 10;
    let corrPts        = 0;
    if (rule.triggers.length >= 2) {
      const key = [...rule.triggers].sort().join("+");
      if (corrPairSet.has(key)) corrPts = 3;
    }
    const trendPts     = matchedTriggers.reduce((acc, metric) => {
      const t = trends[metric] ?? "stable";
      return acc + (t === "rising" ? 2 : t === "falling" && metric === "oil_level" ? 2 : 0);
    }, 0);
    const magnitudePts = matchedTriggers.reduce((acc, m) => acc + (contribMap[m] ?? 0), 0) * 0.5;
    const totalScore   = triggerPts + corrPts + trendPts + magnitudePts;
    const confidence   =
      corrPts > 0 && rule.baseConf === "medium" ? "high" : rule.baseConf;

    return {
      ...rule,
      score:          Math.round(totalScore * 10) / 10,
      matchedTriggers,
      corrPts,
      trendPts,
      confidence,
      isFullMatch:    matchedTriggers.length === rule.triggers.length,
    };
  }).filter((r) => r !== null && r.score >= 3);

  return scored.sort((a, b) => b.score - a.score);
}

function buildEvidence(contributors = [], correlations = [], triggers = [], trends = {}) {
  const evidence = [];
  contributors.slice(0, 3).forEach((c) => {
    const absZ      = Math.abs(c.z_score ?? 0);
    const direction = c.z_score > 0 ? "above" : "below";
    evidence.push({
      type:     "deviation",
      label:    METRIC_LABELS[c.metric] ?? c.metric,
      text:     `${absZ.toFixed(2)}σ ${direction} baseline`,
      trend:    trends[c.metric] ?? "stable",
      severity: absZ >= 4.0 ? "critical" : absZ >= 2.8 ? "warning" : "info",
    });
  });
  (correlations || []).forEach((corr) => {
    const relevant = (triggers || []).includes(corr.a) || (triggers || []).includes(corr.b);
    if (relevant) {
      evidence.push({
        type:     "correlation",
        label:    corr.label,
        text:     "Both metrics rising simultaneously",
        trend:    "rising",
        severity: "warning",
      });
    }
  });
  return evidence;
}

// ── PATH B logic ──────────────────────────────────────────────────────────────

function deriveLiveCause(liveMetrics, correlations) {
  if (!liveMetrics) return null;

  const breaches = [];
  LIVE_THRESHOLDS.forEach((rule) => {
    const val = liveMetrics[rule.key];
    if (val == null) return;
    const atCrit = rule.inverted ? val <= rule.critical : val >= rule.critical;
    const atWarn = rule.inverted ? val <= rule.warn     : val >= rule.warn;
    if (atCrit) {
      breaches.push({ ...rule, val, severity: "critical", threshold: rule.critical });
    } else if (atWarn) {
      breaches.push({ ...rule, val, severity: "warning",  threshold: rule.warn });
    }
  });

  if (!breaches.length) return null;

  breaches.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1;
    }
    const aRatio = a.inverted ? a.threshold / Math.max(a.val, 0.001) : a.val / a.threshold;
    const bRatio = b.inverted ? b.threshold / Math.max(b.val, 0.001) : b.val / b.threshold;
    return bRatio - aRatio;
  });

  const primary = breaches[0];

  const evidence = breaches.map((b) => ({
    type:     "deviation",
    label:    b.label,
    text:     `${b.val.toFixed(1)}${b.unit} — ${b.severity} (threshold: ${b.threshold}${b.unit})`,
    trend:    b.inverted ? "falling" : "rising",
    severity: b.severity,
  }));

  const corrLabels = (correlations || []).map((c) => c.label);

  return {
    primary:    primary.cause,
    detail:     primary.detail,
    confidence: breaches.some((b) => b.severity === "critical") ? "high" : "medium",
    isLive:     true,
    evidence,
    corrLabels,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RootCausePanel
 *
 * Props:
 *   anomalies    – TelemetryResponse[] anomalous readings (newest-first)
 *   correlations – active correlation objects
 *   telemetry    – full telemetry window
 *   confidence   – { score, label } system confidence (optional)
 *   liveMetrics  – latest single telemetry reading for live fallback (optional)
 */
export default function RootCausePanel({
  anomalies    = [],
  correlations = [],
  telemetry    = [],
  confidence   = null,
  liveMetrics  = null,
}) {
  const [showEvidence,     setShowEvidence]     = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showLiveEvidence, setShowLiveEvidence] = useState(false);

  // ── PATH A: ML-backed analysis ────────────────────────────────────────────
  const analysis = useMemo(() => {
    const recent = (anomalies || []).find(
      (a) => a.anomaly_details?.top_contributors?.length > 0
    );
    if (!recent) return null;

    const contributors = recent.anomaly_details.top_contributors;
    const trends       = extractTrends(telemetry);
    const timeAgo      = safeTimeAgo(recent.timestamp);
    const ranked       = rankCauses(contributors, correlations, trends);
    const primary      = ranked[0] ?? null;
    const alts         = ranked.slice(1);

    if (!primary) {
      const top = contributors[0];
      return {
        primary: {
          primary:         `${METRIC_LABELS[top.metric] ?? top.metric} is the primary anomaly driver.`,
          detail:          `Deviates ${Math.abs(top.z_score ?? 0).toFixed(2)}σ from baseline. No multi-metric pattern detected.`,
          confidence:      "low",
          score:           0,
          isFullMatch:     false,
          matchedTriggers: [top.metric],
          corrPts:         0,
        },
        alts:     [],
        evidence: buildEvidence(contributors, correlations, [top.metric], trends),
        timeAgo,
      };
    }

    return {
      primary,
      alts,
      evidence: buildEvidence(contributors, correlations, primary.triggers, trends),
      timeAgo,
    };
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    anomalies?.length,
    correlations?.length,
    telemetry?.length,
  ]);

  // ── PATH B: Live-data fallback (only used when PATH A has no data) ─────────
  const liveCause = useMemo(
    () => (analysis ? null : deriveLiveCause(liveMetrics, correlations)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, liveMetrics, correlations?.length]
  );

  // Neither path produced data
  if (!analysis && !liveCause) return null;

  // ── PATH A render ─────────────────────────────────────────────────────────
  if (analysis) {
    const { primary, alts, evidence, timeAgo } = analysis;
    const confStyle    = CAUSE_CONFIDENCE_STYLE[primary.confidence] || CAUSE_CONFIDENCE_STYLE.low;
    const strengthDots = Math.min(3, Math.ceil((primary.score || 0) / 5));
    const confPrefix   =
      primary.confidence === "high"   ? "High confidence: "   :
      primary.confidence === "medium" ? "Probable: "          :
      "Possible: ";

    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Microscope size={16} className="text-indigo-600 shrink-0" />
            <span className="text-sm font-bold text-indigo-800">Root Cause Analysis</span>
            <span className="text-[10px] text-indigo-400 bg-indigo-100 px-1.5 py-0.5 rounded-full border border-indigo-200 font-medium">
              ML-backed
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${confStyle}`}>
              {primary.confidence} confidence
            </span>
            {confidence && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
                ${confidence.label === "High"
                  ? "bg-green-50 text-green-700 border-green-300"
                  : confidence.label === "Moderate"
                  ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                  : "bg-gray-50 text-gray-600 border-gray-300"
                }`}
              >
                System: {confidence.label}
              </span>
            )}
            {/* Evidence strength dots */}
            <div className="flex items-center gap-0.5" title={`Match strength: ${strengthDots}/3`}>
              {[...Array(3)].map((_, i) => (
                <span key={i} className={`w-2 h-2 rounded-full ${i < strengthDots ? "bg-indigo-500" : "bg-indigo-200"}`} />
              ))}
            </div>
            <span className="text-xs text-indigo-400">{timeAgo}</span>
          </div>
        </div>

        {/* Score metadata */}
        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-indigo-400 font-mono">
          <span>match {(primary.score ?? 0).toFixed(1)}pts</span>
          {primary.corrPts > 0 && <span className="text-indigo-500 font-semibold">· correlation corroborated</span>}
          {!primary.isFullMatch && <span className="text-indigo-300">· partial trigger match</span>}
        </div>

        {/* Primary cause */}
        <p className="text-sm font-semibold text-indigo-900 mb-1 leading-snug">
          {confPrefix}{primary.primary}
        </p>
        <p className="text-xs text-indigo-700 mb-3 leading-relaxed">{primary.detail}</p>

        {/* Evidence (collapsible) */}
        {evidence.length > 0 && (
          <>
            <button
              onClick={() => setShowEvidence((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors mb-2"
            >
              {showEvidence ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showEvidence ? "Hide" : "Show"} supporting evidence ({evidence.length})
            </button>

            {showEvidence && (
              <div className="space-y-1.5 mb-3">
                {evidence.map((ev, i) => {
                  const sStyle = EVIDENCE_STYLE[ev.severity] || EVIDENCE_STYLE.info;
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${sStyle}`}>
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

        {/* Alternative causes (collapsible) */}
        {alts.length > 0 && (
          <>
            <button
              onClick={() => setShowAlternatives((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors border-t border-indigo-200 pt-2 w-full"
            >
              {showAlternatives ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAlternatives ? "Hide" : "Show"} {alts.length} alternative cause{alts.length !== 1 ? "s" : ""}
            </button>

            {showAlternatives && (
              <div className="mt-2 space-y-2">
                {alts.map((alt, i) => {
                  const altConfStyle = CAUSE_CONFIDENCE_STYLE[alt.confidence] || CAUSE_CONFIDENCE_STYLE.low;
                  return (
                    <div key={i} className="bg-white border border-indigo-100 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                        <span className="font-semibold text-indigo-800 text-xs">
                          #{i + 2} {alt.primary}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${altConfStyle}`}>
                            {alt.confidence}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-300">
                            {(alt.score ?? 0).toFixed(1)}pts
                          </span>
                        </div>
                      </div>
                      <p className="text-indigo-600 italic">{alt.detail}</p>
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

  // ── PATH B render (live-data fallback) ────────────────────────────────────
  const liveConfStyle  = CAUSE_CONFIDENCE_STYLE[liveCause.confidence] || CAUSE_CONFIDENCE_STYLE.low;
  const liveConfPrefix = liveCause.confidence === "high" ? "Likely: " : "Probable: ";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm font-bold text-amber-800">Threshold Analysis</span>
          <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full border border-amber-300 font-medium">
            Live data
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${liveConfStyle}`}>
            {liveCause.confidence} confidence
          </span>
          {confidence && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
              ${confidence.label === "High"
                ? "bg-green-50 text-green-700 border-green-300"
                : confidence.label === "Moderate"
                ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                : "bg-gray-50 text-gray-600 border-gray-300"
              }`}
            >
              System: {confidence.label}
            </span>
          )}
        </div>
      </div>

      {/* Live-data notice */}
      <p className="text-[10px] text-amber-500 mb-2 italic">
        Based on current sensor readings — no ML anomaly record available yet.
      </p>

      {/* Primary cause */}
      <p className="text-sm font-semibold text-amber-900 mb-1 leading-snug">
        {liveConfPrefix}{liveCause.primary}
      </p>
      <p className="text-xs text-amber-700 mb-3 leading-relaxed">{liveCause.detail}</p>

      {/* Corroborating correlations */}
      {liveCause.corrLabels?.length > 0 && (
        <p className="text-xs text-amber-600 mb-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0" />
          Correlation detected: {liveCause.corrLabels.join(", ")}
        </p>
      )}

      {/* Threshold evidence (collapsible) */}
      {liveCause.evidence?.length > 0 && (
        <>
          <button
            onClick={() => setShowLiveEvidence((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-amber-600 font-medium hover:text-amber-800 transition-colors mb-2"
          >
            {showLiveEvidence ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showLiveEvidence ? "Hide" : "Show"} threshold details ({liveCause.evidence.length})
          </button>

          {showLiveEvidence && (
            <div className="space-y-1.5">
              {liveCause.evidence.map((ev, i) => {
                const sStyle = EVIDENCE_STYLE[ev.severity] || EVIDENCE_STYLE.info;
                return (
                  <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${sStyle}`}>
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