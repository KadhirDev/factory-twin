/**
 * RecommendationCard
 *
 * Maps detected conditions → prioritised, actionable maintenance recommendations.
 *
 * Input:  live telemetry, current ETAs, active correlations, anomaly score
 * Output: ranked list of recommended actions with urgency level
 *
 * Rules are deterministic and cover the six core metrics.
 * No ML inference — pure rule table so operators can trust and verify.
 */

import React, { useMemo, useState } from "react";
import {
  Wrench,
  ThermometerSun,
  Droplets,
  Gauge,
  Zap,
  Wind,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";

// ── Recommendation rule table ─────────────────────────────────────────────────
// Each rule has:
//   condition(ctx) → bool     — fires when this returns true
//   urgency                   — "critical" | "warning" | "info"
//   icon                      — lucide component
//   title                     — short label
//   action                    — what to do
//   rationale                 — why this matters
//   priority                  — lower = shown first

const RULES = [
  // ── Oil Level ──────────────────────────────────────────────────────────────
  {
    id: "oil_critical",
    condition: (ctx) => ctx.metrics.oil_level != null && ctx.metrics.oil_level <= 10,
    urgency:   "critical",
    icon:      Droplets,
    title:     "Refill Lubrication — Immediate",
    action:    "Stop machine and refill oil to operating level (≥ 40%).",
    rationale: "Oil below 10% causes metal-to-metal friction, accelerated bearing wear, and thermal runaway.",
    priority:  1,
  },
  {
    id: "oil_warning",
    condition: (ctx) => ctx.metrics.oil_level != null && ctx.metrics.oil_level > 10 && ctx.metrics.oil_level <= 20,
    urgency:   "warning",
    icon:      Droplets,
    title:     "Schedule Lubrication Refill",
    action:    "Plan lubrication service within the next maintenance window.",
    rationale: "Low oil (10–20%) increases friction and wear rates significantly.",
    priority:  3,
  },

  // ── Temperature ───────────────────────────────────────────────────────────
  {
    id: "temp_critical",
    condition: (ctx) => ctx.metrics.temperature != null && ctx.metrics.temperature >= 95,
    urgency:   "critical",
    icon:      ThermometerSun,
    title:     "Cooling System — Urgent Inspection",
    action:    "Reduce load immediately. Inspect coolant flow, heat exchangers, and fan operation.",
    rationale: "Temperature ≥ 95°C risks component damage and thermal protection tripping.",
    priority:  2,
  },
  {
    id: "temp_warning",
    condition: (ctx) =>
      ctx.metrics.temperature != null &&
      ctx.metrics.temperature >= 80 &&
      ctx.metrics.temperature < 95,
    urgency:   "warning",
    icon:      ThermometerSun,
    title:     "Check Cooling System",
    action:    "Verify coolant level and flow. Clean heat exchanger fins if blocked.",
    rationale: "Operating at 80–95°C accelerates insulation and seal degradation.",
    priority:  5,
  },
  {
    id: "temp_eta",
    condition: (ctx) => ctx.etaMap.temperature?.etaCrit != null && ctx.etaMap.temperature.etaCrit <= 15,
    urgency:   "warning",
    icon:      Clock,
    title:     "Temperature Rising — Act Within 15 Minutes",
    action:    "Pre-emptively reduce load or increase cooling before critical threshold is reached.",
    rationale: `Projected to reach critical temperature in ~${(ctx) => ctx.etaMap.temperature?.etaCrit} min.`,
    // rationale computed below using dynamic ETA
    priority:  4,
  },

  // ── Vibration ─────────────────────────────────────────────────────────────
  {
    id: "vibration_critical",
    condition: (ctx) => ctx.metrics.vibration != null && ctx.metrics.vibration >= 1.0,
    urgency:   "critical",
    icon:      Gauge,
    title:     "Mechanical Inspection — Rotor / Bearings",
    action:    "Shut down and inspect bearings, shaft alignment, and rotor balance.",
    rationale: "Vibration ≥ 1.0 indicates structural resonance risk and imminent bearing failure.",
    priority:  2,
  },
  {
    id: "vibration_warning",
    condition: (ctx) =>
      ctx.metrics.vibration != null &&
      ctx.metrics.vibration >= 0.5 &&
      ctx.metrics.vibration < 1.0,
    urgency:   "warning",
    icon:      Gauge,
    title:     "Inspect Rotor Balance",
    action:    "Perform vibration analysis. Check for loose fasteners and worn bearings.",
    rationale: "Sustained vibration at 0.5–1.0 leads to fatigue failure in rotating components.",
    priority:  6,
  },

  // ── RPM ──────────────────────────────────────────────────────────────────
  {
    id: "rpm_high",
    condition: (ctx) => ctx.metrics.rpm != null && ctx.metrics.rpm >= 1800,
    urgency:   "warning",
    icon:      RotateCcw,
    title:     "Reduce Machine Speed",
    action:    "Lower operational RPM to within the rated range (< 1800 rpm).",
    rationale: "Over-speed operation stresses bearings, seals, and drive components.",
    priority:  7,
  },
  {
    id: "rpm_vibration_correlation",
    condition: (ctx) => ctx.correlatedPairs.includes("rpm+vibration"),
    urgency:   "warning",
    icon:      RotateCcw,
    title:     "Inspect Rotor — Speed-Vibration Link Detected",
    action:    "Perform balance check at operating speed. Verify coupling alignment.",
    rationale: "Simultaneous RPM and vibration rise suggests resonance or imbalance.",
    priority:  4,
  },

  // ── Pressure ─────────────────────────────────────────────────────────────
  {
    id: "pressure_critical",
    condition: (ctx) => ctx.metrics.pressure != null && ctx.metrics.pressure >= 9.0,
    urgency:   "critical",
    icon:      Wind,
    title:     "Relieve System Pressure — Immediate",
    action:    "Open pressure relief valve. Inspect pump and line blockages.",
    rationale: "Pressure ≥ 9 bar exceeds design limits. Risk of seal failure and pipe rupture.",
    priority:  1,
  },
  {
    id: "pressure_warning",
    condition: (ctx) =>
      ctx.metrics.pressure != null &&
      ctx.metrics.pressure >= 7.0 &&
      ctx.metrics.pressure < 9.0,
    urgency:   "warning",
    icon:      Wind,
    title:     "Monitor Hydraulic Pressure",
    action:    "Check for partial blockage, filter fouling, or pump wear.",
    rationale: "Pressure above 7 bar indicates resistance buildup in the hydraulic circuit.",
    priority:  8,
  },

  // ── Power Consumption ─────────────────────────────────────────────────────
  {
    id: "power_critical",
    condition: (ctx) => ctx.metrics.power_consumption != null && ctx.metrics.power_consumption >= 12,
    urgency:   "critical",
    icon:      Zap,
    title:     "Electrical Load — Emergency Reduction",
    action:    "Reduce load or shut down to prevent motor overload trip.",
    rationale: "Power draw ≥ 12 kW exceeds rated capacity and will trip thermal protection.",
    priority:  2,
  },
  {
    id: "power_temp_correlation",
    condition: (ctx) => ctx.correlatedPairs.includes("temperature+power_consumption"),
    urgency:   "warning",
    icon:      Zap,
    title:     "Thermal-Electric Runaway Risk",
    action:    "Reduce electrical load and verify cooling system operation simultaneously.",
    rationale: "Power and temperature rising together indicates progressive thermal-electric stress.",
    priority:  3,
  },

  // ── All-clear ─────────────────────────────────────────────────────────────
  {
    id: "all_clear",
    condition: (ctx) => ctx.anomalyScore != null && ctx.anomalyScore < 1.5,
    urgency:   "info",
    icon:      CheckCircle,
    title:     "No Immediate Action Required",
    action:    "Continue standard monitoring. Schedule next preventive maintenance as planned.",
    rationale: "All metrics within normal operating ranges. Anomaly score below elevated threshold.",
    priority:  99,
  },
];

// ── Urgency styles ────────────────────────────────────────────────────────────
const URGENCY_STYLE = {
  critical: {
    border:  "border-red-300",
    bg:      "bg-red-50",
    stripe:  "bg-red-500",
    title:   "text-red-800",
    text:    "text-red-700",
    badge:   "bg-red-100 text-red-700 border-red-300",
    icon:    "text-red-500",
  },
  warning: {
    border:  "border-orange-300",
    bg:      "bg-orange-50",
    stripe:  "bg-orange-400",
    title:   "text-orange-800",
    text:    "text-orange-700",
    badge:   "bg-orange-100 text-orange-700 border-orange-300",
    icon:    "text-orange-500",
  },
  info: {
    border:  "border-green-200",
    bg:      "bg-green-50",
    stripe:  "bg-green-400",
    title:   "text-green-800",
    text:    "text-green-600",
    badge:   "bg-green-100 text-green-700 border-green-200",
    icon:    "text-green-500",
  },
};

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(telemetry, correlations, etaItems, anomalyScore) {
  const latest = (telemetry || [])[0] ?? {};

  // Simplify correlations to a set of "a+b" keys
  const correlatedPairs = (correlations || []).map(
    (c) => [c.a, c.b].sort().join("+")
  );

  // ETA map keyed by metric
  const etaMap = {};
  (etaItems || []).forEach((e) => {
    etaMap[e.key] = e;
  });

  return {
    metrics: {
      temperature:       latest.temperature,
      vibration:         latest.vibration,
      rpm:               latest.rpm,
      pressure:          latest.pressure,
      power_consumption: latest.power_consumption,
      oil_level:         latest.oil_level,
    },
    correlatedPairs,
    etaMap,
    anomalyScore: anomalyScore ?? null,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RecommendationCard
 *
 * Props:
 *   telemetry    – TelemetryResponse[] (newest-first)
 *   correlations – active correlation objects (from parent)
 *   etaItems     – ETA objects from computeETAs() (from parent)
 *   anomalyScore – latest composite anomaly score (float|null)
 *   maxVisible   – how many recommendations to show before expand (default 3)
 */
export default function RecommendationCard({
  telemetry    = [],
  correlations = [],
  etaItems     = [],
  anomalyScore = null,
  maxVisible   = 3,
}) {
  const [expanded, setExpanded] = useState(false);

  const recommendations = useMemo(() => {
    const ctx = buildContext(telemetry, correlations, etaItems, anomalyScore);

    const matched = RULES
      .filter((rule) => {
        try {
          return rule.condition(ctx);
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.priority - b.priority);

    // Never show all_clear alongside other recommendations
    const hasActionable = matched.some((r) => r.id !== "all_clear");
    return hasActionable ? matched.filter((r) => r.id !== "all_clear") : matched;
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    telemetry?.length,
    correlations?.length,
    etaItems?.length,
    anomalyScore,
  ]);

  if (!recommendations.length) return null;

  const visible = expanded ? recommendations : recommendations.slice(0, maxVisible);
  const hidden  = recommendations.length - maxVisible;

  return (
    <div className="mb-4">
      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Recommended Actions
          </span>
        </div>
        {recommendations.length > 0 && (
          <span className="text-xs text-gray-400">
            {recommendations.length} action{recommendations.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Recommendation rows ────────────────────────────────────────── */}
      <div className="space-y-2">
        {visible.map((rec) => {
          const s    = URGENCY_STYLE[rec.urgency] || URGENCY_STYLE.info;
          const Icon = rec.icon;

          return (
            <div
              key={rec.id}
              className={`rounded-xl border overflow-hidden ${s.border} ${s.bg}`}
            >
              <div className="flex items-start gap-0">
                {/* Colour stripe */}
                <div className={`w-1 self-stretch shrink-0 ${s.stripe}`} />

                <div className="flex-1 px-3 py-3">
                  {/* Row header */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={14} className={`shrink-0 ${s.icon}`} />
                      <span className={`text-xs font-bold leading-snug ${s.title}`}>
                        {rec.title}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${s.badge}`}
                    >
                      {rec.urgency}
                    </span>
                  </div>

                  {/* Action */}
                  <p className={`text-xs font-medium mb-1 ${s.text}`}>
                    → {rec.action}
                  </p>

                  {/* Rationale */}
                  <p className="text-xs text-gray-500 italic">{rec.rationale}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Expand / collapse ──────────────────────────────────────────── */}
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
        >
          <ChevronDown size={13} />
          Show {hidden} more recommendation{hidden !== 1 ? "s" : ""}
        </button>
      )}
      {expanded && recommendations.length > maxVisible && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
        >
          <ChevronUp size={13} />
          Show fewer
        </button>
      )}
    </div>
  );
}