import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Config ────────────────────────────────────────────────────────────────────

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
  const isCrit = cfg.critical && val >= cfg.critical;
  const isWarn = !isCrit && cfg.warn && val >= cfg.warn;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      <p
        className={`font-bold text-sm ${
          isCrit ? "text-red-600" : isWarn ? "text-yellow-500" : "text-gray-800"
        }`}
      >
        {val?.toFixed(3)} {cfg.unit}
      </p>
      {isCrit && <p className="text-red-500 mt-0.5">⚠ Critical threshold exceeded</p>}
      {isWarn && <p className="text-yellow-500 mt-0.5">⚠ Warning threshold exceeded</p>}
    </div>
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
 */
export default function TelemetryChart({
  data = [],
  metric = "temperature",
  height = 200,
  showThresholds = true,
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
    }))
    .filter((d) => d.value !== null);

  // Compute Y-axis domain with padding
  const values = chartData.map((d) => d.value);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 100;
  const pad = (maxVal - minVal) * 0.15 || 5;
  const yMin = Math.floor(minVal - pad);
  const yMax = Math.ceil(maxVal + pad);

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
        {chartData.length > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">
            {chartData.length} pts
          </span>
        )}
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
            <Legend />

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
              dot={false}
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}