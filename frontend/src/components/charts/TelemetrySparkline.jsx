import React from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

/**
 * TelemetrySparkline
 * A tiny inline chart showing the last N readings of one metric.
 *
 * Props:
 *   data   – array of TelemetryResponse objects (newest first from API)
 *   metric – key to plot (default: "temperature")
 *   color  – line color (default: "#3b82f6")
 *   height – px height (default: 36)
 */
export default function TelemetrySparkline({
  data = [],
  metric = "temperature",
  color = "#3b82f6",
  height = 36,
}) {
  if (!data?.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-gray-200 text-xs"
      >
        —
      </div>
    );
  }

  // API returns newest-first; chart needs oldest-first
  const chartData = [...data]
    .reverse()
    .map((d) => ({ v: d[metric] ?? null }))
    .filter((d) => d.v !== null);

  if (chartData.length < 2) {
    return (
      <div style={{ height }} className="flex items-end">
        <span className="text-xs text-gray-300">Not enough data</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}