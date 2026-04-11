import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { parseISO, format, startOfHour, subHours } from "date-fns";

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="text-gray-500 font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
          <span className="capitalize text-gray-600 w-14">{p.dataKey}</span>
          <span className="font-bold text-gray-800 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * AlertTrendChart
 *
 * Props:
 *   alerts  – AlertResponse[] (all alerts, any order)
 *   hours   – number of hours to show (default 12)
 *   height  – chart height px (default 160)
 */
export default function AlertTrendChart({ alerts = [], hours = 12, height = 160 }) {
  const chartData = useMemo(() => {
    const safe = alerts || [];
    if (!safe.length) return [];

    const now    = new Date();
    const cutoff = subHours(now, hours);

    // Build empty buckets for each hour in range
    const buckets = {};
    for (let h = 0; h < hours; h++) {
      const bucket = format(subHours(now, hours - 1 - h), "HH:00");
      buckets[bucket] = { time: bucket, critical: 0, warning: 0 };
    }

    // Fill buckets from alert data
    safe.forEach((alert) => {
      const ts = parseISO(alert.created_at);
      if (ts < cutoff) return;
      const bucket = format(startOfHour(ts), "HH:00");
      if (!buckets[bucket]) return;
      const sev = alert.severity === "critical" ? "critical" : "warning";
      buckets[bucket][sev] = (buckets[bucket][sev] || 0) + 1;
    });

    return Object.values(buckets);
  }, [alerts, hours]);

  if (!chartData.length || chartData.every((d) => d.critical === 0 && d.warning === 0)) {
    return (
      <div
        className="flex items-center justify-center text-gray-300 text-sm"
        style={{ height }}
      >
        No alerts in the last {hours} hours
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<TrendTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="critical" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="warning"  fill="#f59e0b" stackId="a" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}