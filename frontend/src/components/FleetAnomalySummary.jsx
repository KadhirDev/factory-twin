import React from "react";
import { Link } from "react-router-dom";
import { useTelemetryCache } from "../context/TelemetryContext";
import { Zap, CheckCircle } from "lucide-react";

function scoreColor(score) {
  if (score >= 4.0) return "text-red-600 bg-red-50 border-red-200";
  if (score >= 2.8) return "text-orange-600 bg-orange-50 border-orange-200";
  if (score >= 1.5) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-green-600 bg-green-50 border-green-200";
}

/**
 * FleetAnomalySummary
 *
 * Props:
 *   machines – MachineResponse[] from getMachines()
 */
export default function FleetAnomalySummary({ machines = [] }) {
  const { getLatest } = useTelemetryCache();

  // Build scored list
  const scored = (machines || [])
    .map((m) => {
      const latest = getLatest(m.machine_id);
      return {
        machine_id:  m.machine_id,
        name:        m.name || m.machine_id,
        score:       latest?.anomaly_score ?? null,
        is_anomaly:  latest?.is_anomaly    ?? false,
        temperature: latest?.temperature   ?? null,
      };
    })
    .filter((m) => m.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const anomalous = scored.filter((m) => m.is_anomaly);
  const allClear  = anomalous.length === 0 && scored.length > 0;

  if (scored.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={15} className={anomalous.length > 0 ? "text-orange-500" : "text-green-500"} />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Fleet Anomaly Status
          </span>
        </div>
        {allClear && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle size={13} />
            All machines normal
          </div>
        )}
        {anomalous.length > 0 && (
          <span className="text-xs font-bold text-orange-600">
            {anomalous.length} machine{anomalous.length !== 1 ? "s" : ""} anomalous
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {scored.map((m) => (
          <Link
            key={m.machine_id}
            to={`/machines/${m.machine_id}`}
            className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2 hover:shadow-sm transition-shadow ${scoreColor(m.score ?? 0)}`}
          >
            <span className="font-medium truncate">{m.name}</span>
            <span className="font-mono font-bold shrink-0 tabular-nums">
              {m.score?.toFixed(2)}σ
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}