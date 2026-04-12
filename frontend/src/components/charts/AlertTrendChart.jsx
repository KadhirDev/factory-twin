import React, { useState, useMemo } from "react";
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

const RANGES = [
  { label: "6 hr", hours: 6 },
  { label: "12 hr", hours: 12 },
  { label: "24 hr", hours: 24 },
];

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="text-gray-500 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: p.fill }}
          />
          <span className="capitalize text-gray-600 w-14">{p.dataKey}</span>
          <span className="font-bold text-gray-800 tabular-nums">{p.value}</span>
        </div>
      ))}
      {total > 0 && (
        <div className="flex items-center gap-2 mt-1.5 border-t border-gray-100 pt-1.5">
          <span className="text-gray-400 w-16">total</span>
          <span className="font-bold text-gray-700 tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
}

/**
 * AlertTrendChart
 *
 * Props:
 *   alerts  – AlertResponse[]
 *   height  – chart height px (default 160)
 */
export default function AlertTrendChart({ alerts = [], height = 160 }) {
  const [range, setRange] = useState(RANGES[1]); // default 12h

  const chartData = useMemo(() => {
    const safe = alerts || [];
    const now = new Date();
    const cutoff = subHours(now, range.hours);

    const buckets = {};
    for (let h = 0; h < range.hours; h++) {
      const key = format(subHours(now, range.hours - 1 - h), "HH:00");
      buckets[key] = { time: key, critical: 0, warning: 0 };
    }

    safe.forEach((alert) => {
      const ts = parseISO(alert.created_at);
      if (ts < cutoff) return;
      const key = format(startOfHour(ts), "HH:00");
      if (!buckets[key]) return;
      const sev = alert.severity === "critical" ? "critical" : "warning";
      buckets[key][sev]++;
    });

    return Object.values(buckets);
  }, [alerts, range.hours]);

  const hasData = chartData.some((d) => d.critical > 0 || d.warning > 0);

  return (
    <div>
      {/* Range selector */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Alerts per hour</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium
                ${
                  range.label === r.label
                    ? "bg-blue-600 text-white border-transparent"
                    : "text-gray-500 border-gray-200 bg-white hover:bg-gray-50"
                }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div
          className="flex items-center justify-center text-gray-300 text-sm"
          style={{ height }}
        >
          No alerts in the last {range.hours} hours
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f3f4f6"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval={range.hours <= 6 ? 0 : "preserveStartEnd"}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar
              dataKey="critical"
              fill="#ef4444"
              stackId="a"
              radius={[0, 0, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="warning"
              fill="#f59e0b"
              stackId="a"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}