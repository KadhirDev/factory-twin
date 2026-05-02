/**
 * RecommendationCard
 *
 * Deterministic rule engine: conditions → scored + ranked operator actions.
 *
 * Action score formula:
 *   urgency_base  (critical=100, warning=60, info=20)
 * + eta_pts       (critETA ≤5min → 30, ≤15 → 20, ≤30 → 10)
 * + corr_pts      (correlation signal present → 15)
 * × confidence_mult (High=1.0, Moderate=0.85, Low=0.7)
 *
 * "Recommended First Action" banner shows:
 *   - cause → action link (causeSummary)
 *   - time-to-act chip (Immediate / Urgent / Soon / Monitor)
 *   - "Why first:" rationale
 *   - "What if ignored?" collapsible
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
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Star,
  AlertOctagon,
  Link,
} from "lucide-react";

// ── Rule table ────────────────────────────────────────────────────────────────
const RULES = [
  // ── Oil Level ─────────────────────────────────────────────────────────────
  {
    id: "oil_critical",
    condition: (ctx) => ctx.metrics.oil_level != null && ctx.metrics.oil_level <= 10,
    urgency: "critical",
    impact: "High",
    icon: Droplets,
    title: "Refill Lubrication — Immediate",
    action: "Stop machine and refill oil to operating level (≥ 40%).",
    rationale: "Oil below 10% causes metal-to-metal friction and thermal runaway.",
    consequence: "Ignoring this will cause irreversible bearing seizure within minutes of continued operation.",
    why: "Oil is critically low — immediate risk of catastrophic bearing failure.",
    priority: 1,
    correlationKey: null,
  },
  {
    id: "oil_warning",
    condition: (ctx) => ctx.metrics.oil_level != null && ctx.metrics.oil_level > 10 && ctx.metrics.oil_level <= 20,
    urgency: "warning",
    impact: "Medium",
    icon: Droplets,
    title: "Schedule Lubrication Refill",
    action: "Plan lubrication service within the next maintenance window.",
    rationale: "Low oil (10–20%) increases friction and wear rates significantly.",
    consequence: "Continued operation will accelerate bearing wear and shorten component lifespan.",
    why: "Oil approaching critical level — early action prevents unplanned downtime.",
    priority: 3,
    correlationKey: null,
  },

  // ── Temperature ───────────────────────────────────────────────────────────
  {
    id: "temp_critical",
    condition: (ctx) => ctx.metrics.temperature != null && ctx.metrics.temperature >= 95,
    urgency: "critical",
    impact: "High",
    icon: ThermometerSun,
    title: "Cooling System — Urgent Inspection",
    action: "Reduce load immediately. Inspect coolant flow, heat exchangers, and fan operation.",
    rationale: "Temperature ≥ 95°C risks component damage and thermal protection tripping.",
    consequence: "Insulation breakdown and thermal trip will cause unplanned shutdown and potential motor damage.",
    why: "Temperature at critical threshold — component failure imminent without intervention.",
    priority: 2,
    correlationKey: null,
  },
  {
    id: "temp_warning",
    condition: (ctx) => ctx.metrics.temperature != null && ctx.metrics.temperature >= 80 && ctx.metrics.temperature < 95,
    urgency: "warning",
    impact: "Medium",
    icon: ThermometerSun,
    title: "Check Cooling System",
    action: "Verify coolant level and flow. Clean heat exchanger fins if blocked.",
    rationale: "Operating at 80–95°C accelerates insulation and seal degradation.",
    consequence: "Prolonged high temperature shortens motor lifespan and risks reaching critical threshold.",
    why: "Temperature above warning level — cooling maintenance reduces escalation risk.",
    priority: 5,
    correlationKey: null,
  },
  {
    id: "temp_eta",
    condition: (ctx) => ctx.etaMap.temperature?.etaCrit != null && ctx.etaMap.temperature.etaCrit <= 15,
    urgency: "warning",
    impact: "High",
    icon: Clock,
    title: "Temperature Rising — Pre-emptive Action",
    action: "Reduce load or increase cooling before critical threshold is reached.",
    rationale: "Projected to reach critical temperature within 15 minutes based on current trend.",
    consequence: "If unchecked, critical threshold breach will trigger thermal protection and force unplanned shutdown.",
    why: "Short ETA to critical temperature — pre-empting now is cheaper than reacting after a trip.",
    priority: 4,
    correlationKey: null,
  },

  // ── Vibration ─────────────────────────────────────────────────────────────
  {
    id: "vibration_critical",
    condition: (ctx) => ctx.metrics.vibration != null && ctx.metrics.vibration >= 1.0,
    urgency: "critical",
    impact: "High",
    icon: Gauge,
    title: "Mechanical Inspection — Rotor / Bearings",
    action: "Shut down and inspect bearings, shaft alignment, and rotor balance.",
    rationale: "Vibration ≥ 1.0 indicates resonance risk and imminent bearing failure.",
    consequence: "Continued operation causes accelerating bearing damage, potential rotor contact, and machine destruction.",
    why: "Critical vibration level — structural failure is the outcome without intervention.",
    priority: 2,
    correlationKey: null,
  },
  {
    id: "vibration_warning",
    condition: (ctx) => ctx.metrics.vibration != null && ctx.metrics.vibration >= 0.5 && ctx.metrics.vibration < 1.0,
    urgency: "warning",
    impact: "Medium",
    icon: Gauge,
    title: "Inspect Rotor Balance",
    action: "Perform vibration analysis. Check for loose fasteners and worn bearings.",
    rationale: "Sustained vibration at 0.5–1.0 leads to fatigue failure in rotating components.",
    consequence: "Unresolved vibration will progressively damage bearings and ultimately require full rotor replacement.",
    why: "Vibration at warning threshold — early mechanical inspection prevents costly escalation.",
    priority: 6,
    correlationKey: null,
  },

  // ── RPM ───────────────────────────────────────────────────────────────────
  {
    id: "rpm_high",
    condition: (ctx) => ctx.metrics.rpm != null && ctx.metrics.rpm >= 1800,
    urgency: "warning",
    impact: "Medium",
    icon: RotateCcw,
    title: "Reduce Machine Speed",
    action: "Lower operational RPM to within the rated range (< 1800 rpm).",
    rationale: "Over-speed operation stresses bearings, seals, and drive components.",
    consequence: "Sustained over-speed causes premature seal failure and drive component fatigue.",
    why: "RPM exceeds rated limit — speed reduction directly eliminates the stress source.",
    priority: 7,
    correlationKey: null,
  },
  {
    id: "rpm_vibration_correlation",
    condition: (ctx) => ctx.correlatedPairs.includes("rpm+vibration"),
    urgency: "warning",
    impact: "High",
    icon: RotateCcw,
    title: "Inspect Rotor — Speed-Vibration Link Detected",
    action: "Perform balance check at operating speed. Verify coupling alignment.",
    rationale: "Simultaneous RPM and vibration rise confirms mechanical resonance or imbalance.",
    consequence: "Unresolved resonance causes exponentially increasing vibration, leading to rapid bearing failure.",
    why: "Correlated rise in both signals confirms structural issue — not a transient event.",
    priority: 4,
    correlationKey: "rpm+vibration",
  },

  // ── Pressure ──────────────────────────────────────────────────────────────
  {
    id: "pressure_critical",
    condition: (ctx) => ctx.metrics.pressure != null && ctx.metrics.pressure >= 9.0,
    urgency: "critical",
    impact: "High",
    icon: Wind,
    title: "Relieve System Pressure — Immediate",
    action: "Open pressure relief valve. Inspect pump and line blockages.",
    rationale: "Pressure ≥ 9 bar exceeds design limits. Risk of seal failure and pipe rupture.",
    consequence: "Above design pressure causes seal rupture, fluid loss, and possible pipe burst — safety hazard.",
    why: "System pressure above safety limit — immediate relief prevents catastrophic failure.",
    priority: 1,
    correlationKey: null,
  },
  {
    id: "pressure_warning",
    condition: (ctx) => ctx.metrics.pressure != null && ctx.metrics.pressure >= 7.0 && ctx.metrics.pressure < 9.0,
    urgency: "warning",
    impact: "Low",
    icon: Wind,
    title: "Monitor Hydraulic Pressure",
    action: "Check for partial blockage, filter fouling, or pump wear.",
    rationale: "Pressure above 7 bar indicates resistance building in the hydraulic circuit.",
    consequence: "Unresolved pressure elevation will progressively stress seals and may reach critical level.",
    why: "Elevated pressure trend warrants investigation before it escalates.",
    priority: 8,
    correlationKey: null,
  },

  // ── Power ─────────────────────────────────────────────────────────────────
  {
    id: "power_critical",
    condition: (ctx) => ctx.metrics.power_consumption != null && ctx.metrics.power_consumption >= 12,
    urgency: "critical",
    impact: "High",
    icon: Zap,
    title: "Electrical Load — Emergency Reduction",
    action: "Reduce load or shut down to prevent motor overload trip.",
    rationale: "Power draw ≥ 12 kW exceeds rated capacity — thermal protection will trip.",
    consequence: "Motor overload trip forces emergency shutdown and may damage motor windings.",
    why: "Overload condition active — thermal protection will trip without load reduction.",
    priority: 2,
    correlationKey: null,
  },
  {
    id: "power_temp_correlation",
    condition: (ctx) => ctx.correlatedPairs.includes("power_consumption+temperature"),
    urgency: "warning",
    impact: "High",
    icon: Zap,
    title: "Thermal-Electric Runaway Risk",
    action: "Reduce electrical load and verify cooling system simultaneously.",
    rationale: "Power and temperature rising together indicates a reinforcing thermal-electric stress loop.",
    consequence: "Left unaddressed, the thermal-electric loop accelerates until thermal protection trips or winding damage occurs.",
    why: "Both signals rising together — single intervention won't break the loop; both must be addressed.",
    priority: 3,
    correlationKey: "power_consumption+temperature",
  },

  // ── All clear ─────────────────────────────────────────────────────────────
  {
    id: "all_clear",
    condition: (ctx) => ctx.anomalyScore == null || ctx.anomalyScore < 1.5,
    urgency: "info",
    impact: null,
    icon: CheckCircle,
    title: "No Immediate Action Required",
    action: "Continue standard monitoring. Schedule preventive maintenance as planned.",
    rationale: "All metrics within normal operating ranges.",
    consequence: null,
    why: null,
    priority: 99,
    correlationKey: null,
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const URGENCY_STYLE = {
  critical: {
    border: "border-red-300",
    bg: "bg-red-50",
    stripe: "bg-red-500",
    title: "text-red-800",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700 border-red-300",
    icon: "text-red-500",
  },
  warning: {
    border: "border-orange-300",
    bg: "bg-orange-50",
    stripe: "bg-orange-400",
    title: "text-orange-800",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-700 border-orange-300",
    icon: "text-orange-500",
  },
  info: {
    border: "border-green-200",
    bg: "bg-green-50",
    stripe: "bg-green-400",
    title: "text-green-800",
    text: "text-green-600",
    badge: "bg-green-100 text-green-700 border-green-200",
    icon: "text-green-500",
  },
};

const IMPACT_STYLE = {
  High: "bg-red-100 text-red-700 border-red-300",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low: "bg-gray-100 text-gray-500 border-gray-300",
};

// ── Time-to-act derivation ────────────────────────────────────────────────────
//
// Maps urgency + impact to a human-readable "when to act" label.
// This replaces the internal "score N" number in the banner —
// which was meaningless to operators.
//
const TIME_TO_ACT_STYLES = {
  Immediate: "bg-red-100 text-red-700 border-red-300",
  Urgent: "bg-orange-100 text-orange-700 border-orange-300",
  Soon: "bg-yellow-100 text-yellow-700 border-yellow-300",
  Monitor: "bg-gray-100 text-gray-500 border-gray-300",
};

function getTimeToAct(urgency, impact) {
  if (urgency === "critical") {
    return "Immediate";
  }
  if (urgency === "warning" && impact === "High") {
    return "Urgent";
  }
  if (urgency === "warning") {
    return "Soon";
  }
  return "Monitor";
}

// ── Scoring ───────────────────────────────────────────────────────────────────
const URGENCY_BASE = { critical: 100, warning: 60, info: 20 };
const CONF_MULT = { High: 1.0, Moderate: 0.85, Low: 0.7 };

function scoreAction(rule, ctx, confidenceLabel) {
  const base = URGENCY_BASE[rule.urgency] ?? 20;
  const corrPts = rule.correlationKey && ctx.correlatedPairs.includes(rule.correlationKey) ? 15 : 0;
  const metricKey = rule.id.split("_")[0];
  const eta = ctx.etaMap[metricKey]?.etaCrit;
  const etaPts = eta == null ? 0 : eta <= 5 ? 30 : eta <= 15 ? 20 : eta <= 30 ? 10 : 0;
  const mult = CONF_MULT[confidenceLabel] ?? 0.7;
  return Math.round((base + corrPts + etaPts) * mult);
}

function buildContext(telemetry, correlations, etaItems, anomalyScore) {
  const latest = (telemetry || [])[0] ?? {};
  const correlatedPairs = (correlations || []).map((c) => [c.a, c.b].sort().join("+"));
  const etaMap = {};
  (etaItems || []).forEach((e) => {
    etaMap[e.key] = e;
  });
  return {
    metrics: {
      temperature: latest.temperature ?? null,
      vibration: latest.vibration ?? null,
      rpm: latest.rpm ?? null,
      pressure: latest.pressure ?? null,
      power_consumption: latest.power_consumption ?? null,
      oil_level: latest.oil_level ?? null,
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
 *   correlations – active correlation objects
 *   etaItems     – ETA objects
 *   anomalyScore – float | null
 *   confidence   – { score, label } | null
 *   causeSummary – string | null — short cause description for cross-linking
 *   maxVisible   – int (default 3)
 */
export default function RecommendationCard({
  telemetry = [],
  correlations = [],
  etaItems = [],
  anomalyScore = null,
  confidence = null,
  causeSummary = null,
  maxVisible = 3,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConseq, setShowConseq] = useState(null);

  const confidenceLabel = confidence?.label ?? "Low";

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
      .map((rule) => ({ ...rule, actionScore: scoreAction(rule, ctx, confidenceLabel) }))
      .sort((a, b) => b.actionScore - a.actionScore);

    const hasActionable = matched.some((r) => r.id !== "all_clear");
    return hasActionable ? matched.filter((r) => r.id !== "all_clear") : matched;
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    telemetry?.length,
    correlations?.length,
    etaItems?.length,
    anomalyScore,
    confidenceLabel,
  ]);

  if (!recommendations.length) return null;

  const firstAction = recommendations[0];
  const rest = recommendations.slice(1);
  const visible = expanded ? rest : rest.slice(0, maxVisible - 1);
  const hidden = rest.length - (maxVisible - 1);

  return (
    <div className="mb-4">
      {/* ── Section header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Recommended Actions
          </span>
          {confidence && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                confidenceLabel === "High"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : confidenceLabel === "Moderate"
                    ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                    : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            >
              {confidenceLabel} confidence
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {recommendations.length} action{recommendations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Recommended First Action banner ─────────────────────────── */}
      {firstAction && firstAction.id !== "all_clear" && (
        <div className="mb-2 rounded-xl border-2 border-indigo-300 bg-indigo-50 overflow-hidden">
          {/* Banner label row */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 border-b border-indigo-200">
            <Star size={12} className="text-indigo-600 fill-indigo-600" />
            <span className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
              Recommended First Action
            </span>

            {(() => {
              const tta = getTimeToAct(firstAction.urgency, firstAction.impact);
              const style = TIME_TO_ACT_STYLES[tta] ?? TIME_TO_ACT_STYLES.Monitor;
              return (
                <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${style}`}>
                  {tta}
                </span>
              );
            })()}

            <div className="ml-auto flex items-center gap-1.5">
              {firstAction.impact && (
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${IMPACT_STYLE[firstAction.impact] ?? ""}`}>
                  {firstAction.impact} impact
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${URGENCY_STYLE[firstAction.urgency]?.badge ?? ""}`}>
                {firstAction.urgency}
              </span>
            </div>
          </div>

          {/* Banner content */}
          <div className="px-3 py-3">
            {/* Cause → Action link */}
            {causeSummary && (
              <div className="flex items-center gap-1.5 mb-2 text-[10px] text-indigo-500 bg-indigo-100 rounded-lg px-2 py-1 border border-indigo-200">
                <Link size={10} className="text-indigo-400 shrink-0" />
                <span className="opacity-70 font-medium">Responding to:</span>
                <span className="font-semibold text-indigo-700">{causeSummary}</span>
              </div>
            )}

            {/* Action title + icon */}
            <div className="flex items-center gap-2 mb-1">
              {React.createElement(firstAction.icon, {
                size: 14,
                className: URGENCY_STYLE[firstAction.urgency]?.icon ?? "text-gray-500",
              })}
              <span className="text-xs font-bold text-indigo-900">{firstAction.title}</span>
            </div>

            {/* Action instruction */}
            <p className="text-xs font-medium text-indigo-800 mb-1">→ {firstAction.action}</p>

            {/* Rationale */}
            <p className="text-xs text-indigo-600 italic mb-1">{firstAction.rationale}</p>

            {/* Why first */}
            {firstAction.why && (
              <p className="text-[10px] text-indigo-500 border-t border-indigo-200 pt-1.5 mb-1">
                <span className="font-semibold">Why first: </span>
                {firstAction.why}
              </p>
            )}

            {/* Consequence (collapsible) */}
            {firstAction.consequence && (
              <button
                onClick={() => setShowConseq(showConseq === firstAction.id ? null : firstAction.id)}
                className="text-[10px] text-indigo-400 hover:text-indigo-600 flex items-center gap-1 transition-colors mt-1"
                type="button"
              >
                <AlertOctagon size={10} />
                {showConseq === firstAction.id ? "Hide" : "What if ignored?"}
              </button>
            )}
            {showConseq === firstAction.id && firstAction.consequence && (
              <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1.5 mt-1 border border-red-200">
                ⚠ {firstAction.consequence}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Remaining recommendations ────────────────────────────────── */}
      <div className="space-y-2">
        {visible.map((rec) => {
          const s = URGENCY_STYLE[rec.urgency] || URGENCY_STYLE.info;
          const Icon = rec.icon;
          return (
            <div key={rec.id} className={`rounded-xl border overflow-hidden ${s.border} ${s.bg}`}>
              <div className="flex items-start gap-0">
                <div className={`w-1 self-stretch shrink-0 ${s.stripe}`} />
                <div className="flex-1 px-3 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={14} className={`shrink-0 ${s.icon}`} />
                      <span className={`text-xs font-bold leading-snug ${s.title}`}>{rec.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(() => {
                        const tta = getTimeToAct(rec.urgency, rec.impact);
                        const style = TIME_TO_ACT_STYLES[tta] ?? TIME_TO_ACT_STYLES.Monitor;
                        return (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style}`}>
                            {tta}
                          </span>
                        );
                      })()}
                      {rec.impact && (
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${IMPACT_STYLE[rec.impact] ?? ""}`}>
                          {rec.impact}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${s.badge}`}>
                        {rec.urgency}
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs font-medium mb-1 ${s.text}`}>→ {rec.action}</p>
                  <p className="text-xs text-gray-500 italic">{rec.rationale}</p>
                  {rec.why && (
                    <p className="text-[10px] text-gray-400 mt-1 flex items-start gap-1">
                      <span className="w-1 h-1 rounded-full bg-gray-300 inline-block mt-1 shrink-0" />
                      <span>
                        <span className="font-medium">Why: </span>
                        {rec.why}
                      </span>
                    </p>
                  )}
                  {rec.consequence && (
                    <>
                      <button
                        onClick={() => setShowConseq(showConseq === rec.id ? null : rec.id)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 mt-1.5 transition-colors"
                        type="button"
                      >
                        <AlertOctagon size={10} />
                        {showConseq === rec.id ? "Hide" : "What if ignored?"}
                      </button>
                      {showConseq === rec.id && (
                        <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1.5 mt-1 border border-red-200">
                          ⚠ {rec.consequence}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Expand / collapse ────────────────────────────────────────── */}
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
          type="button"
        >
          <ChevronDown size={13} />
          Show {hidden} more recommendation{hidden !== 1 ? "s" : ""}
        </button>
      )}
      {expanded && rest.length > maxVisible - 1 && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full justify-center py-1.5 bg-gray-50 rounded-lg border border-gray-200"
          type="button"
        >
          <ChevronUp size={13} />
          Show fewer
        </button>
      )}
    </div>
  );
}
