/**
 * RiskMomentumBadge
 *
 * Combines risk direction AND magnitude into a single 5-level label:
 *   Rapidly Worsening | Worsening | Stable | Improving | Rapidly Improving
 *
 * Magnitude is determined by:
 *   - number of bad/good signals (score trend, ETA proximity, frequency)
 *   - presence of a near-term critical ETA (< 10 min = high magnitude)
 *
 * Props:
 *   direction   – "worsening" | "stable" | "improving"
 *   badCount    – number of worsening signals (0–3)
 *   goodCount   – number of improving signals (0–3)
 *   hasUrgentETA – bool (any critical ETA ≤ 10 min)
 */

import React from "react";
import {
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronDown,
  ChevronsDown,
} from "lucide-react";

const LEVELS = {
  rapidly_worsening:  { label: "Rapidly Worsening",  icon: ChevronsUp,   bg: "bg-red-100",    border: "border-red-400",    text: "text-red-800"   },
  worsening:          { label: "Worsening",           icon: ChevronUp,    bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800"},
  stable:             { label: "Stable",              icon: Minus,        bg: "bg-gray-100",   border: "border-gray-300",   text: "text-gray-600"  },
  improving:          { label: "Improving",           icon: ChevronDown,  bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-800"  },
  rapidly_improving:  { label: "Rapidly Improving",   icon: ChevronsDown, bg: "bg-green-100",  border: "border-green-300",  text: "text-green-800" },
};

/**
 * computeMomentumLevel
 * Exported so AIInsightPanel can call it and pass the result as props.
 */
export function computeMomentumLevel(direction, badCount, goodCount, hasUrgentETA) {
  if (direction === "worsening") {
    return (badCount >= 2 || hasUrgentETA) ? "rapidly_worsening" : "worsening";
  }
  if (direction === "improving") {
    return goodCount >= 2 ? "rapidly_improving" : "improving";
  }
  return "stable";
}

export default function RiskMomentumBadge({ direction, badCount = 0, goodCount = 0, hasUrgentETA = false }) {
  const key = computeMomentumLevel(direction, badCount, goodCount, hasUrgentETA);
  const cfg = LEVELS[key] || LEVELS.stable;
  const Icon = cfg.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold
        ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <Icon size={12} />
      {cfg.label}
    </div>
  );
}