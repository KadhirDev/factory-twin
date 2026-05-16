/**
 * RiskMomentumBadge
 *
 * Visualises operational risk direction and recovery state across
 * five stable momentum levels:
 *
 *   critical_escalation – all worsening signals active + urgent ETA
 *   worsening           – elevated operational deterioration
 *   stable              – no dominant direction
 *   stabilizing         – early recovery indicators detected
 *   recovering          – multiple improving signals detected
 *
 * Exported:
 *   computeMomentumLevel()
 *
 * Used by:
 *   AIInsightPanel
 *   escalation reinforcement logic
 */

import React from "react";
import {
  TrendingUp,
  Minus,
  AlertOctagon,
  ShieldCheck,
  Wind,
} from "lucide-react";

/**
 * Computes operational momentum level.
 *
 * @param {"worsening"|"improving"|"stable"} direction
 * @param {number} badCount
 * @param {number} goodCount
 * @param {boolean} hasUrgentETA
 *
 * @returns {
 *   "critical_escalation"|
 *   "worsening"|
 *   "stable"|
 *   "stabilizing"|
 *   "recovering"
 * }
 */
export function computeMomentumLevel(
  direction,
  badCount,
  goodCount,
  hasUrgentETA
) {
  const safeBadCount = Number(badCount) || 0;
  const safeGoodCount = Number(goodCount) || 0;

  // Critical escalation
  if (
    direction === "worsening" &&
    safeBadCount >= 3 &&
    hasUrgentETA
  ) {
    return "critical_escalation";
  }

  // Elevated deterioration
  if (direction === "worsening") {
    return "worsening";
  }

  // Strong recovery trend
  if (
    direction === "improving" &&
    safeGoodCount >= 2
  ) {
    return "recovering";
  }

  // Early recovery signal
  if (direction === "improving") {
    return "stabilizing";
  }

  // Neutral
  return "stable";
}

// ─────────────────────────────────────────────────────────────
// Level configuration
// ─────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  critical_escalation: {
    icon: AlertOctagon,
    label: "Critical Escalation",

    bg: "bg-red-100",
    border: "border-red-400",
    text: "text-red-700",
    iconColor: "text-red-600",

    pulse: true,
    glow: true,

    title:
      "All major risk signals are worsening with an urgent ETA — immediate intervention required.",
  },

  worsening: {
    icon: TrendingUp,
    label: "Worsening",

    bg: "bg-orange-100",
    border: "border-orange-300",
    text: "text-orange-700",
    iconColor: "text-orange-600",

    pulse: false,
    glow: false,

    title:
      "Multiple operational signals are trending toward elevated risk.",
  },

  stable: {
    icon: Minus,
    label: "Stable",

    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-600",
    iconColor: "text-gray-400",

    pulse: false,
    glow: false,

    title:
      "No dominant operational risk direction detected.",
  },

  stabilizing: {
    icon: Wind,
    label: "Stabilizing",

    bg: "bg-teal-50",
    border: "border-teal-300",
    text: "text-teal-700",
    iconColor: "text-teal-500",

    pulse: false,
    glow: false,

    title:
      "Initial recovery indicators detected. Operational pressure is beginning to ease.",
  },

  recovering: {
    icon: ShieldCheck,
    label: "Recovering",

    bg: "bg-green-100",
    border: "border-green-300",
    text: "text-green-700",
    iconColor: "text-green-600",

    pulse: false,
    glow: true,

    title:
      "Multiple signals are improving. The system is recovering from elevated operational risk.",
  },
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function RiskMomentumBadge({
  direction = "stable",
  badCount = 0,
  goodCount = 0,
  hasUrgentETA = false,
}) {
  const level = computeMomentumLevel(
    direction,
    badCount,
    goodCount,
    hasUrgentETA
  );

  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.stable;
  const Icon = cfg.icon;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5
        rounded-full border px-2.5 py-1
        text-xs font-semibold
        ${cfg.bg}
        ${cfg.border}
        ${cfg.text}
        ${cfg.pulse ? "animate-pulse" : ""}
        ${cfg.glow ? "shadow-sm" : ""}
      `}
      title={cfg.title}
    >
      <Icon
        size={12}
        className={`
          shrink-0
          ${cfg.iconColor}
          ${cfg.pulse ? "animate-pulse" : ""}
        `}
      />

      {cfg.label}
    </div>
  );
}