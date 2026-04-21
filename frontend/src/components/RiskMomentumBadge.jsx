/**
 * RiskMomentumBadge
 *
 * Combines risk direction AND magnitude into a multi-level label:
 *   Critical Escalation | Rapidly Worsening | Worsening | Stable | Improving | Rapidly Improving
 *
 * Level selection:
 *   Critical Escalation  — badCount ≥ 3 AND hasUrgentETA (all signals + imminent breach)
 *   Rapidly Worsening    — badCount ≥ 2 OR hasUrgentETA
 *   Worsening            — direction = "worsening", lower magnitude
 *   Stable               — no clear direction
 *   Improving            — goodCount < 2
 *   Rapidly Improving    — goodCount ≥ 2
 */

import React from "react";
import {
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronDown,
  ChevronsDown,
  AlertOctagon,
} from "lucide-react";

const LEVELS = {
  critical_escalation: {
    label: "Critical Escalation",
    icon: AlertOctagon,
    bg: "bg-red-200",
    border: "border-red-600",
    text: "text-red-900",
    pulse: true,
  },
  rapidly_worsening: {
    label: "Rapidly Worsening",
    icon: ChevronsUp,
    bg: "bg-red-100",
    border: "border-red-400",
    text: "text-red-800",
    pulse: false,
  },
  worsening: {
    label: "Worsening",
    icon: ChevronUp,
    bg: "bg-orange-100",
    border: "border-orange-300",
    text: "text-orange-800",
    pulse: false,
  },
  stable: {
    label: "Stable",
    icon: Minus,
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-600",
    pulse: false,
  },
  improving: {
    label: "Improving",
    icon: ChevronDown,
    bg: "bg-blue-100",
    border: "border-blue-300",
    text: "text-blue-800",
    pulse: false,
  },
  rapidly_improving: {
    label: "Rapidly Improving",
    icon: ChevronsDown,
    bg: "bg-green-100",
    border: "border-green-300",
    text: "text-green-800",
    pulse: false,
  },
};

/**
 * computeMomentumLevel
 * Exported — used by AIInsightPanel
 */
export function computeMomentumLevel(direction, badCount, goodCount, hasUrgentETA) {
  if (direction === "worsening") {
    // 🔥 NEW: Critical escalation condition
    if (badCount >= 3 && hasUrgentETA) return "critical_escalation";

    if (badCount >= 2 || hasUrgentETA) return "rapidly_worsening";

    return "worsening";
  }

  if (direction === "improving") {
    return goodCount >= 2 ? "rapidly_improving" : "improving";
  }

  return "stable";
}

export default function RiskMomentumBadge({
  direction = "stable",
  badCount = 0,
  goodCount = 0,
  hasUrgentETA = false,
}) {
  const key = computeMomentumLevel(direction, badCount, goodCount, hasUrgentETA);
  const cfg = LEVELS[key] || LEVELS.stable;
  const Icon = cfg.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold
        ${cfg.bg} ${cfg.border} ${cfg.text}
        ${cfg.pulse ? "animate-pulse" : ""}`}
    >
      <Icon size={12} />
      {cfg.label}
    </div>
  );
}