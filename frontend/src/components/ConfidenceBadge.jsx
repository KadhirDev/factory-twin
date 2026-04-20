/**
 * ConfidenceBadge
 *
 * Displays the AI system's confidence in its current analysis.
 *
 * Confidence is computed from four signals:
 *   1. Sample maturity  — how many readings the ML model was trained on
 *   2. Model type       — Isolation Forest vs z-score (fallback)
 *   3. Variance stability — how stable the baseline metrics are
 *   4. Score trend       — stable / improving trends = higher confidence
 *
 * Props:
 *   score  – integer 0–100
 *   label  – "Low" | "Moderate" | "High"
 *   detail – optional tooltip / expanded text
 */

import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, Shield, Info } from "lucide-react";

const LEVEL_CONFIG = {
  High: {
    bg:     "bg-green-50",
    border: "border-green-300",
    text:   "text-green-800",
    bar:    "bg-green-500",
    icon:   ShieldCheck,
    iconColor: "text-green-600",
    desc:   "Analysis is based on sufficient data and a trained ML model.",
  },
  Moderate: {
    bg:     "bg-yellow-50",
    border: "border-yellow-300",
    text:   "text-yellow-800",
    bar:    "bg-yellow-400",
    icon:   ShieldAlert,
    iconColor: "text-yellow-600",
    desc:   "Analysis is partially supported. More data will improve accuracy.",
  },
  Low: {
    bg:     "bg-gray-50",
    border: "border-gray-300",
    text:   "text-gray-600",
    bar:    "bg-gray-400",
    icon:   Shield,
    iconColor: "text-gray-400",
    desc:   "Limited data available. Treat insights as indicative only.",
  },
};

export default function ConfidenceBadge({ score = 0, label = "Low", detail = null }) {
  const [showDetail, setShowDetail] = useState(false);
  const cfg  = LEVEL_CONFIG[label] || LEVEL_CONFIG.Low;
  const Icon = cfg.icon;

  return (
    <div className={`inline-flex flex-col rounded-xl border px-3 py-2 ${cfg.bg} ${cfg.border} min-w-[120px]`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className={cfg.iconColor} />
          <span className={`text-xs font-bold ${cfg.text}`}>{label} Confidence</span>
        </div>
        <button
          onClick={() => setShowDetail((v) => !v)}
          className={`${cfg.iconColor} hover:opacity-70 transition-opacity`}
          title="What is confidence?"
          aria-label="Confidence explanation"
        >
          <Info size={12} />
        </button>
      </div>

      {/* Score bar */}
      <div className="mt-1.5 h-1.5 bg-white rounded-full overflow-hidden border border-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Numeric score */}
      <p className={`text-[10px] font-mono mt-0.5 text-right ${cfg.text} opacity-70`}>
        {score}%
      </p>

      {/* Expandable detail */}
      {showDetail && (
        <p className={`text-[10px] mt-1.5 leading-relaxed ${cfg.text} opacity-80 border-t border-current border-opacity-20 pt-1.5`}>
          {detail || cfg.desc}
        </p>
      )}
    </div>
  );
}