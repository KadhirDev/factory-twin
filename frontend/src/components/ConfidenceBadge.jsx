/**
 * ConfidenceBadge
 *
 * Full-width confidence display. Spans the available container width so it
 * is never easy to overlook regardless of viewport size.
 *
 * Features:
 * - Confidence score display (0–100)
 * - Expandable explanation detail
 * - Warmup / baseline-learning state
 * - Safe score clamping
 * - Null-safe rendering
 *
 * Props:
 *   score       – 0–100
 *   label       – "Low" | "Moderate" | "High"
 *   detail      – expandable explanation string
 *   isWarmingUp – when true, shows baseline-learning state
 */

import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Info,
  Loader,
} from "lucide-react";

const LEVEL_CONFIG = {
  High: {
    bg: "bg-green-50",
    border: "border-green-300",
    text: "text-green-800",
    bar: "bg-green-500",
    icon: ShieldCheck,
    iconColor: "text-green-600",
    desc: "Analysis is based on sufficient data and a trained ML model.",
  },

  Moderate: {
    bg: "bg-yellow-50",
    border: "border-yellow-300",
    text: "text-yellow-800",
    bar: "bg-yellow-400",
    icon: ShieldAlert,
    iconColor: "text-yellow-600",
    desc: "Analysis is partially supported. More data will improve accuracy.",
  },

  Low: {
    bg: "bg-gray-50",
    border: "border-gray-300",
    text: "text-gray-600",
    bar: "bg-gray-400",
    icon: Shield,
    iconColor: "text-gray-400",
    desc: "Limited data available. Treat insights as indicative only.",
  },
};

export default function ConfidenceBadge({
  score = 0,
  label = "Low",
  detail = null,
  isWarmingUp = false,
}) {
  const [showDetail, setShowDetail] = useState(false);

  const cfg = LEVEL_CONFIG[label] || LEVEL_CONFIG.Low;
  const Icon = cfg.icon;

  // Null-safe + bounded confidence score
  const safeScore = Math.min(100, Math.max(0, Number(score) || 0));

  return (
    <div
      className={`w-full rounded-xl border px-3 py-2 ${cfg.bg} ${cfg.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className={cfg.iconColor} />

          <span className={`text-xs font-bold ${cfg.text}`}>
            {isWarmingUp
              ? "Learning Baseline"
              : `${label} Confidence`}
          </span>

          {isWarmingUp && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-indigo-500">
              <Loader size={9} className="animate-spin" />
              warming up
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono tabular-nums ${cfg.text} opacity-70`}
          >
            {safeScore}%
          </span>

          <button
            onClick={() => setShowDetail((v) => !v)}
            className={`${cfg.iconColor} transition-opacity hover:opacity-70`}
            title="What is confidence?"
            aria-label="Confidence explanation"
            type="button"
          >
            <Info size={12} />
          </button>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-gray-100 bg-white">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
          style={{ width: `${safeScore}%` }}
        />
      </div>

      {/* Warmup state explanation */}
      {isWarmingUp && (
        <p className="mt-1 text-[10px] italic text-indigo-400">
          Insufficient historical context — insights will stabilise as the
          baseline develops.
        </p>
      )}

      {/* Expandable detail */}
      {showDetail && (
        <p
          className={`mt-1.5 border-t border-current border-opacity-20 pt-1.5 text-[10px] leading-relaxed ${cfg.text} opacity-80`}
        >
          {detail || cfg.desc}
        </p>
      )}
    </div>
  );
}