import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Cpu,
} from "lucide-react";

// ── Score → severity level ─────────────────────────────────────────────────────
function getLevel(score) {
  if (score == null) return "unknown";
  if (score >= 4.0)  return "critical";
  if (score >= 2.8)  return "warning";
  if (score >= 1.5)  return "elevated";
  return "normal";
}

const LEVEL_CONFIG = {
  normal:   { label: "Normal",          bg: "bg-green-50",  border: "border-green-200", text: "text-green-700",  icon: ShieldCheck, iconColor: "text-green-500",  bar: "bg-green-400"  },
  elevated: { label: "Elevated",        bg: "bg-yellow-50", border: "border-yellow-200",text: "text-yellow-700", icon: ShieldAlert, iconColor: "text-yellow-500", bar: "bg-yellow-400" },
  warning:  { label: "Anomaly Warning", bg: "bg-orange-50", border: "border-orange-200",text: "text-orange-700", icon: Zap,         iconColor: "text-orange-500", bar: "bg-orange-400" },
  critical: { label: "Critical Anomaly",bg: "bg-red-50",    border: "border-red-200",   text: "text-red-700",    icon: Zap,         iconColor: "text-red-500",    bar: "bg-red-500"    },
  unknown:  { label: "Warming Up",      bg: "bg-gray-50",   border: "border-gray-200",  text: "text-gray-500",   icon: ShieldCheck, iconColor: "text-gray-400",   bar: "bg-gray-300"   },
};

const TREND_ICON = {
  rising:  { icon: TrendingUp,   color: "text-red-500"   },
  falling: { icon: TrendingDown, color: "text-green-500" },
  stable:  { icon: Minus,        color: "text-gray-400"  },
};

/**
 * AnomalyStatusCard
 *
 * Props:
 *   score        – current anomaly score (float | null)
 *   trend        – "rising" | "falling" | "stable" | null
 *   detectorType – "isolation_forest" | "z_score" | null
 *   mlReady      – bool
 *   sampleCount  – int (how many samples the model was trained on)
 */
export default function AnomalyStatusCard({
  score        = null,
  trend        = null,
  detectorType = null,
  mlReady      = false,
  sampleCount  = 0,
}) {
  const level  = getLevel(score);
  const cfg    = LEVEL_CONFIG[level];
  const Icon   = cfg.icon;
  const isML   = detectorType === "isolation_forest" || mlReady;

  // Score bar width — map 0..8 to 0..100%
  const barPct = score != null ? Math.min(100, (score / 8) * 100) : 0;

  const TrendCfg  = trend ? TREND_ICON[trend] : TREND_ICON.stable;
  const TrendIcon = TrendCfg.icon;

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3 mb-3">

        {/* Left: severity icon + label */}
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.iconColor} />
          <div>
            <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {score != null ? `Score: ${score.toFixed(3)}σ` : "Insufficient data"}
            </p>
          </div>
        </div>

        {/* Right: trend + detector badges */}
        <div className="flex flex-col items-end gap-1.5">
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${TrendCfg.color}`}>
              <TrendIcon size={12} />
              <span className="capitalize">{trend}</span>
            </div>
          )}
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border
            ${isML
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-gray-100 text-gray-500 border-gray-200"
            }`}
          >
            <Cpu size={10} />
            {isML ? "Isolation Forest" : "Z-Score"}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5 bg-white rounded-full overflow-hidden border border-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
        <span>0σ — normal</span>
        <span>
          {sampleCount > 0
            ? `trained on ${sampleCount} samples`
            : "warming up…"
          }
        </span>
        <span>8σ — critical</span>
      </div>
    </div>
  );
}