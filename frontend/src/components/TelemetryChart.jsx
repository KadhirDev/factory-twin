import React from "react";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Metric config (exported — used by MachineView metric selector) ───────────

export const METRIC_CONFIG = {
  temperature:       { label: "Temperature", unit: "°C",  color: "#ef4444", warn: 80,   critical: 95 },
  vibration:         { label: "Vibration",   unit: "",    color: "#f97316", warn: 0.5,  critical: 1.0 },
  rpm:               { label: "RPM",         unit: "rpm", color: "#3b82f6", warn: 1800, critical: 2000 },
  pressure:          { label: "Pressure",    unit: "bar", color: "#8b5cf6", warn: 7.0,  critical: 9.0 },
  power_consumption: { label: "Power",       unit: "kW",  color: "#10b981", warn: 8.0,  critical: 12 },
  oil_level:         { label: "Oil Level",   unit: "%",   color: "#f59e0b", warn: null, critical: null },
};

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;

  const cfg = METRIC_CONFIG[metric] || {};
  const val = payload[0]?.value;
  const row = payload[0]?.payload;
  const isCrit = cfg.critical && val >= cfg.critical;
  const isWarn = !isCrit && cfg.warn && val >= cfg.warn;
  const isAnom = row?.is_anomaly;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs max-w-52">
      <p className="text-gray-400 mb-1.5 font-mono">{label}</p>
      <p
        className={`font-bold text-sm ${
          isCrit ? "text-red-600" : isWarn ? "text-yellow-600" : "text-gray-800"
        }`}
      >
        {val?.toFixed(3)} {cfg.unit}
      </p>

      {isAnom && row?.anomaly_score != null && (
        <p className="text-orange-600 font-medium mt-1">
          🤖 Anomaly detected ({row.anomaly_score.toFixed(2)}σ)
        </p>
      )}

      {isCrit && <p className="text-red-500 mt-0.5">⚠ Critical threshold</p>}
      {isWarn && !isCrit && <p className="text-yellow-500 mt-0.5">⚠ Warning threshold</p>}
    </div>
  );
}

// ── Custom anomaly dot renderer ──────────────────────────────────────────────

function AnomalyDot(props) {
  const { cx, cy, payload } = props;

  if (!payload?.is_anomaly) return null;

  const isCrit = payload?.anomaly_score >= 4.0;
  const fill = isCrit ? "#dc2626" : "#f97316";

  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={fill} fillOpacity={0.2} />
      <circle cx={cx} cy={cy} r={4} fill={fill} stroke="white" strokeWidth={1.5} />
    </g>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TelemetryChart
 *
 * Props:
 *   data — array of TelemetryResponse objects (newest first from API)
 *   metric — key from METRIC_CONFIG
 *   height — chart height in px (default 200)
 *   showThresholds — draw warn/critical reference lines (default true)
 *   showAnomalies — render anomaly markers and anomaly count (default true)
 */
export default function TelemetryChart({
  data = [],
  metric = "temperature",
  height = 200,
  showThresholds = true,
  showAnomalies = true,
}) {
  const cfg = METRIC_CONFIG[metric] || {
    label: metric,
    color: "#6b7280",
    unit: "",
  };

  // API returns newest-first; chart needs oldest-first
  const chartData = [...data]
    .reverse()
    .map((d) => ({
      time: format(parseISO(d.timestamp), "HH:mm:ss"),
      value: d[metric] ?? null,
      is_anomaly: d.is_anomaly ?? false,
      anomaly_score: d.anomaly_score ?? null,
    }))
    .filter((d) => d.value !== null);

  // Compute Y-axis domain with padding
  const values = chartData.map((d) => d.value);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 100;
  const pad = (maxVal - minVal) * 0.15 || 5;
  const yMin = Math.floor(minVal - pad);
  const yMax = Math.ceil(maxVal + pad);

  const anomalyCount = chartData.filter((d) => d.is_anomaly).length;

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: cfg.color }}
          />
          <span className="text-sm font-semibold text-gray-700">{cfg.label}</span>
          {cfg.unit && <span className="text-xs text-gray-400">({cfg.unit})</span>}
        </div>

        <div className="flex items-center gap-2">
          {showAnomalies && anomalyCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 font-medium px-2 py-0.5 rounded-full">
              {anomalyCount} anomal{anomalyCount === 1 ? "y" : "ies"}
            </span>
          )}
          {chartData.length > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">
              {chartData.length} pts
            </span>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div
          className="flex items-center justify-center text-gray-300 text-sm"
          style={{ height }}
        >
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />

            <Tooltip content={<CustomTooltip metric={metric} />} />

            {showThresholds && cfg.warn && (
              <ReferenceLine
                y={cfg.warn}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: "warn",
                  position: "insideTopRight",
                  fontSize: 9,
                  fill: "#f59e0b",
                }}
              />
            )}

            {showThresholds && cfg.critical && (
              <ReferenceLine
                y={cfg.critical}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: "crit",
                  position: "insideTopRight",
                  fontSize: 9,
                  fill: "#ef4444",
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={cfg.color}
              strokeWidth={2}
              dot={showAnomalies ? <AnomalyDot /> : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}