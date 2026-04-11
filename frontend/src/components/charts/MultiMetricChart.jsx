import React, { useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Metric definitions ────────────────────────────────────────────────────────
export const MULTI_METRICS = {
  temperature:       { label: "Temp",     unit: "°C",  color: "#ef4444", warn: 80,   critical: 95   },
  vibration:         { label: "Vibration",unit: "",    color: "#f97316", warn: 0.5,  critical: 1.0  },
  rpm:               { label: "RPM",      unit: "rpm", color: "#3b82f6", warn: 1800, critical: 2000 },
  pressure:          { label: "Pressure", unit: "bar", color: "#8b5cf6", warn: 7.0,  critical: 9.0  },
  power_consumption: { label: "Power",    unit: "kW",  color: "#10b981", warn: 8.0,  critical: 12   },
  oil_level:         { label: "Oil",      unit: "%",   color: "#f59e0b", warn: null, critical: null },
};

// ── Custom tooltip ────────────────────────────────────────────────────────────
function MultiTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs max-w-xs">
      <p className="text-gray-400 mb-2 font-mono">{label}</p>
      {payload.map((p) => {
        const cfg = MULTI_METRICS[p.dataKey] || {};
        const isCrit = cfg.critical && p.value >= cfg.critical;
        const isWarn = !isCrit && cfg.warn && p.value >= cfg.warn;
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-gray-600 w-16">{cfg.label ?? p.dataKey}</span>
            <span
              className={`font-bold tabular-nums ml-auto ${
                isCrit ? "text-red-600" : isWarn ? "text-yellow-500" : "text-gray-800"
              }`}
            >
              {p.value?.toFixed(3)} {cfg.unit}
            </span>
          </div>
        );
      })}
      {payload.some((p) => p.payload?.is_anomaly) && (
        <p className="text-orange-600 font-medium mt-1.5 border-t border-orange-100 pt-1.5">
          🤖 Anomaly detected
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * MultiMetricChart
 *
 * Props:
 *   data            – TelemetryResponse[] (newest-first from API)
 *   defaultMetrics  – string[] of metric keys to show initially
 *   height          – chart height px (default 260)
 *   showThresholds  – draw warn/critical reference lines (default true)
 */
export default function MultiMetricChart({
  data = [],
  defaultMetrics = ["temperature", "vibration"],
  height = 260,
  showThresholds = true,
}) {
  const [active, setActive] = useState(new Set(defaultMetrics));

  const toggle = (key) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least 1
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Oldest-first for chart
  const chartData = [...(data || [])]
    .reverse()
    .map((d) => ({
      time:        format(parseISO(d.timestamp), "HH:mm:ss"),
      is_anomaly:  d.is_anomaly   ?? false,
      anomaly_score: d.anomaly_score ?? null,
      ...Object.fromEntries(
        Object.keys(MULTI_METRICS).map((k) => [k, d[k] ?? null])
      ),
    }));

  // Assign Y-axis IDs: first active metric = left, rest = right
  const activeKeys = [...active];
  const yAxisIds   = activeKeys.map((k, i) => (i === 0 ? "left" : "right"));

  // Reference lines for active metrics
  const refLines = [];
  activeKeys.forEach((key) => {
    const cfg = MULTI_METRICS[key];
    if (!showThresholds) return;
    if (cfg.warn)     refLines.push({ y: cfg.warn,     color: "#f59e0b", label: `${cfg.label} warn`  });
    if (cfg.critical) refLines.push({ y: cfg.critical, color: "#ef4444", label: `${cfg.label} crit`  });
  });

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
      {/* Metric toggle pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(MULTI_METRICS).map(([key, cfg]) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                ${on ? "text-white border-transparent" : "text-gray-400 border-gray-200 bg-white hover:border-gray-300"}`}
              style={on ? { backgroundColor: cfg.color } : {}}
            >
              {cfg.label}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-300 self-center tabular-nums">
          {chartData.length} pts
        </span>
      </div>

      {chartData.length < 2 ? (
        <div
          className="flex items-center justify-center text-gray-200 text-sm"
          style={{ height }}
        >
          Collecting data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              interval="preserveStartEnd"
            />

            {/* Left Y axis — first active metric */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {/* Right Y axis — shown only when 2+ metrics active */}
            {activeKeys.length > 1 && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
            )}

            <Tooltip content={<MultiTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(val) => MULTI_METRICS[val]?.label ?? val}
            />

            {/* Reference lines */}
            {refLines.map((rl, i) => (
              <ReferenceLine
                key={i}
                yAxisId="left"
                y={rl.y}
                stroke={rl.color}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: rl.label, position: "insideTopRight", fontSize: 8, fill: rl.color }}
              />
            ))}

            {/* Lines per active metric */}
            {activeKeys.map((key, i) => (
              <Line
                key={key}
                yAxisId={yAxisIds[i]}
                type="monotone"
                dataKey={key}
                stroke={MULTI_METRICS[key].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}