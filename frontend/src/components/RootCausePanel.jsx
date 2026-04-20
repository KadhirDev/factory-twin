/**
 * RootCausePanel
 *
 * Synthesises contributor z-scores + correlation signals + metric trends
 * into a ranked list of candidate causes.
 *
 * Algorithm:
 *   1. For each CAUSAL_RULE, compute a match score:
 *        trigger_match_pts = matched_triggers / total_triggers × 10
 *        correlation_pts   = any correlation corroborates? +3
 *        trend_agreement   = triggers that are also trending in the expected direction? +2 each
 *      Total possible ≈ 10 + 3 + triggers×2
 *   2. Sort candidates descending by score, keep those with score ≥ 3
 *   3. Show top candidate as primary, rest in collapsible "Alternative causes"
 */

import React, { useMemo, useState } from "react";
import {
  Microscope,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  temperature: "Temperature",
  vibration: "Vibration",
  rpm: "RPM",
  pressure: "Pressure",
  power_consumption: "Power Consumption",
  oil_level: "Oil Level",
};

const CAUSAL_RULES = [
  {
    id: "temp_vibration",
    triggers: ["temperature", "vibration"],
    primary: "Thermal stress is elevating vibration.",
    detail:
      "Rising temperature causes thermal expansion and bearing wear, directly increasing mechanical vibration.",
    baseConf: "high",
  },
  {
    id: "temp_power",
    triggers: ["temperature", "power_consumption"],
    primary: "Increased power draw is generating excess heat.",
    detail:
      "Higher electrical load raises internal temperature. Inspect motor windings and cooling fans.",
    baseConf: "high",
  },
  {
    id: "rpm_vibration",
    triggers: ["rpm", "vibration"],
    primary: "RPM instability is causing mechanical vibration.",
    detail:
      "Uneven rotational speed creates resonance. Check rotor balance and shaft alignment.",
    baseConf: "high",
  },
  {
    id: "pressure_power",
    triggers: ["pressure", "power_consumption"],
    primary: "Hydraulic resistance is increasing power demand.",
    detail:
      "Elevated pressure from blockage or wear forces the pump to work harder.",
    baseConf: "medium",
  },
  {
    id: "oil_level",
    triggers: ["oil_level"],
    primary: "Lubrication level is critically low.",
    detail:
      "Low oil causes metal-to-metal friction, leading to elevated temperature and vibration.",
    baseConf: "high",
  },
  {
    id: "temp_only",
    triggers: ["temperature"],
    primary: "Isolated temperature anomaly detected.",
    detail:
      "No correlated metric confirms the cause. Check coolant flow and ambient conditions.",
    baseConf: "low",
  },
  {
    id: "vib_only",
    triggers: ["vibration"],
    primary: "Isolated vibration spike detected.",
    detail:
      "Single-metric event. Could be transient load impact or mounting looseness.",
    baseConf: "low",
  },
  {
    id: "rpm_only",
    triggers: ["rpm"],
    primary: "RPM deviation detected without correlated signals.",
    detail:
      "Isolated speed change. Verify drive controller settings and load demand.",
    baseConf: "low",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTrends(telemetry = []) {
  const trends = {};
  Object.keys(METRIC_LABELS).forEach((key) => {
    const values = (telemetry || [])
      .map((d) => d[key])
      .filter((v) => v != null)
      .reverse();
    if (values.length < 6) {
      trends[key] = "stable";
      return;
    }
    const mid = Math.floor(values.length / 2);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const diff = avg(values.slice(mid)) - avg(values.slice(0, mid));
    const base = Math.abs(avg(values.slice(0, mid))) || 1;
    trends[key] =
      Math.abs(diff) / base > 0.03
        ? diff > 0
          ? "rising"
          : "falling"
        : "stable";
  });
  return trends;
}

/**
 * rankCauses
 *
 * Scores every CAUSAL_RULE that has at least one trigger present in topMetrics.
 * Returns sorted array of scored candidates (score ≥ 3 only).
 */
function rankCauses(contributors = [], correlations = [], trends = {}) {
  if (!contributors.length) return [];

  const topMetrics = contributors
    .slice()
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
    .map((c) => c.metric);

  const topMetricSet = new Set(topMetrics);
  const contribMap = Object.fromEntries(
    contributors.map((c) => [c.metric, Math.abs(c.z_score)])
  );

  const corrPairSet = new Set(
    correlations.map((c) => [c.a, c.b].sort().join("+"))
  );

  const scored = CAUSAL_RULES.map((rule) => {
    const matchedTriggers = rule.triggers.filter((t) => topMetricSet.has(t));
    if (!matchedTriggers.length) return null;

    const triggerPts =
      (matchedTriggers.length / rule.triggers.length) * 10;

    let corrPts = 0;
    if (rule.triggers.length >= 2) {
      const key = [...rule.triggers].sort().join("+");
      if (corrPairSet.has(key)) corrPts = 3;
    }

    const trendPts = matchedTriggers.reduce((acc, metric) => {
      const t = trends[metric] ?? "stable";
      return acc + (t === "rising" ? 2 : t === "falling" && metric === "oil_level" ? 2 : 0);
    }, 0);

    const magnitudePts =
      matchedTriggers.reduce((acc, m) => acc + (contribMap[m] ?? 0), 0) * 0.5;

    const totalScore = triggerPts + corrPts + trendPts + magnitudePts;

    const confidence =
      corrPts > 0 && rule.baseConf === "medium" ? "high" : rule.baseConf;

    return {
      ...rule,
      score: Math.round(totalScore * 10) / 10,
      matchedTriggers,
      corrPts,
      trendPts,
      confidence,
      isFullMatch: matchedTriggers.length === rule.triggers.length,
    };
  }).filter((r) => r !== null && r.score >= 3);

  return scored.sort((a, b) => b.score - a.score);
}

function buildEvidence(contributors = [], correlations = [], triggers = [], trends = {}) {
  const evidence = [];

  contributors.slice(0, 3).forEach((c) => {
    const absZ = Math.abs(c.z_score);
    const direction = c.z_score > 0 ? "above" : "below";
    evidence.push({
      type: "deviation",
      label: METRIC_LABELS[c.metric] ?? c.metric,
      text: `${absZ.toFixed(2)}σ ${direction} baseline`,
      trend: trends[c.metric] ?? "stable",
      severity: absZ >= 4.0 ? "critical" : absZ >= 2.8 ? "warning" : "info",
    });
  });

  correlations.forEach((corr) => {
    const relevant = triggers.includes(corr.a) || triggers.includes(corr.b);
    if (relevant) {
      evidence.push({
        type: "correlation",
        label: corr.label,
        text: "Both metrics rising simultaneously",
        trend: "rising",
        severity: "warning",
      });
    }
  });

  return evidence;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const CAUSE_CONF_STYLE = {
  high: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-gray-100 text-gray-600 border-gray-300",
};

const EVIDENCE_STYLE = {
  critical: "text-red-700 bg-red-50 border-red-200",
  warning: "text-orange-700 bg-orange-50 border-orange-200",
  info: "text-blue-700 bg-blue-50 border-blue-200",
};

function TrendIcon({ trend, size = 12 }) {
  if (trend === "rising") {
    return <TrendingUp size={size} className="text-red-500" />;
  }
  if (trend === "falling") {
    return <TrendingDown size={size} className="text-green-500" />;
  }
  return <Minus size={size} className="text-gray-400" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RootCausePanel({
  anomalies = [],
  correlations = [],
  telemetry = [],
  confidence = null,
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const analysis = useMemo(() => {
    const recent = (anomalies || []).find(
      (a) => a.anomaly_details?.top_contributors?.length > 0
    );
    if (!recent) return null;

    const contributors = recent.anomaly_details.top_contributors;
    const trends = extractTrends(telemetry);
    const timeAgo = formatDistanceToNow(parseISO(recent.timestamp), {
      addSuffix: true,
    });

    const ranked = rankCauses(contributors, correlations, trends);
    const primary = ranked[0] ?? null;
    const alts = ranked.slice(1);

    if (!primary) {
      const top = contributors[0];
      return {
        primary: {
          primary: `${METRIC_LABELS[top.metric] ?? top.metric} is the primary anomaly driver.`,
          detail: `Deviates ${Math.abs(top.z_score).toFixed(
            2
          )}σ from baseline. No multi-metric pattern detected.`,
          confidence: "low",
          score: 0,
          isFullMatch: false,
          matchedTriggers: [top.metric],
          corrPts: 0,
        },
        alts: [],
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
  }, [anomalies, correlations, telemetry]);

  if (!analysis) return null;

  const { primary, alts, evidence, timeAgo } = analysis;
  const confStyle = CAUSE_CONF_STYLE[primary.confidence] || CAUSE_CONF_STYLE.low;
  const strengthDots = Math.min(3, Math.ceil(primary.score / 5));

  const confPrefix =
    primary.confidence === "high"
      ? "High confidence: "
      : primary.confidence === "medium"
      ? "Probable: "
      : "Possible: ";

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Microscope size={16} className="text-indigo-600 shrink-0" />
          <span className="text-sm font-bold text-indigo-800">
            Root Cause Analysis
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${confStyle}`}
          >
            {primary.confidence} confidence
          </span>

          {confidence && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                confidence.label === "High"
                  ? "bg-green-50 text-green-700 border-green-300"
                  : confidence.label === "Moderate"
                  ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                  : "bg-gray-50 text-gray-600 border-gray-300"
              }`}
            >
              System: {confidence.label}
            </span>
          )}

          <div
            className="flex items-center gap-0.5"
            title={`Match strength: ${strengthDots}/3`}
          >
            {[...Array(3)].map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < strengthDots ? "bg-indigo-500" : "bg-indigo-200"
                }`}
              />
            ))}
          </div>

          <span className="text-xs text-indigo-400">{timeAgo}</span>
        </div>
      </div>

      {/* ── Score line ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-2 text-[10px] text-indigo-400 font-mono">
        <span>match {primary.score.toFixed(1)}pts</span>
        {primary.corrPts > 0 && (
          <span className="text-indigo-500 font-semibold">
            · correlation corroborated
          </span>
        )}
        {!primary.isFullMatch && (
          <span className="text-indigo-300">· partial trigger match</span>
        )}
      </div>

      {/* ── Primary cause ─────────────────────────────────────────────── */}
      <p className="text-sm font-semibold text-indigo-900 mb-1 leading-snug">
        {confPrefix}
        {primary.primary}
      </p>
      <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
        {primary.detail}
      </p>

      {/* ── Evidence ──────────────────────────────────────────────────── */}
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

      {/* ── Alternative causes ────────────────────────────────────────── */}
      {alts.length > 0 && (
        <>
          <button
            onClick={() => setShowAlternatives((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors border-t border-indigo-200 pt-2 w-full"
          >
            {showAlternatives ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showAlternatives ? "Hide" : "Show"} {alts.length} alternative cause
            {alts.length !== 1 ? "s" : ""}
          </button>

          {showAlternatives && (
            <div className="mt-2 space-y-2">
              {alts.map((alt, i) => {
                const altConfStyle =
                  CAUSE_CONF_STYLE[alt.confidence] || CAUSE_CONF_STYLE.low;
                return (
                  <div
                    key={i}
                    className="bg-white border border-indigo-100 rounded-lg p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                      <span className="font-semibold text-indigo-800 text-xs">
                        #{i + 2} {alt.primary}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${altConfStyle}`}
                        >
                          {alt.confidence}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300">
                          {alt.score.toFixed(1)}pts
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