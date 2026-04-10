/**
 * Anomaly score badge — shown on machine cards and detail view.
 * Score is the composite z-score from the AI detector.
 */
import React from "react";

const getLevel = (score) => {
  if (score == null) return null;
  if (score >= 4.0) {
    return {
      label: "Critical Anomaly",
      cls: "bg-red-600 text-white",
      ring: "ring-red-300",
    };
  }
  if (score >= 2.8) {
    return {
      label: "Anomaly",
      cls: "bg-orange-500 text-white",
      ring: "ring-orange-300",
    };
  }
  if (score >= 1.8) {
    return {
      label: "Elevated",
      cls: "bg-yellow-400 text-gray-800",
      ring: "ring-yellow-300",
    };
  }
  return null;
};

export default function AnomalyBadge({ score, showScore = true }) {
  const level = getLevel(score);
  if (!level) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${level.cls} ${level.ring}`}
      title={`Anomaly score: ${score?.toFixed(2)}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80 animate-pulse" />
      {level.label}
      {showScore && score != null && (
        <span className="opacity-75 ml-0.5">({score.toFixed(1)}σ)</span>
      )}
    </span>
  );
}

/**
 * Small inline score pill — used inside charts and tables.
 */
export function AnomalyScorePill({ score }) {
  if (score == null) return null;

  const isAnom = score >= 2.8;
  const isCrit = score >= 4.0;

  return (
    <span
      className={`text-xs font-mono px-1.5 py-0.5 rounded font-medium ${
        isCrit
          ? "bg-red-100 text-red-700"
          : isAnom
          ? "bg-orange-100 text-orange-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {score.toFixed(2)}σ
    </span>
  );
} 