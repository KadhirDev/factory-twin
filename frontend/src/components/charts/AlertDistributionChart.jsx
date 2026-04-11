import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const SEVERITY_COLORS = {
  critical: "#ef4444",
  warning:  "#f59e0b",
  info:     "#3b82f6",
};

// ── Custom donut tooltip ───────────────────────────────────────────────────────
function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-1.5 text-xs">
      <span className="capitalize font-semibold">{name}</span>: {value}
    </div>
  );
}

/**
 * AlertDistributionChart
 *
 * Props:
 *   alerts – array of AlertResponse objects
 */
export default function AlertDistributionChart({ alerts = [] }) {
  if (!alerts?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-300 text-sm">
        No alert data yet
      </div>
    );
  }

  // ── Donut: severity distribution ─────────────────────────────────────────
  const severityCounts = alerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {});

  const donutData = Object.entries(severityCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // ── Bar: top 5 machines by alert count ───────────────────────────────────
  const machineCounts = alerts.reduce((acc, a) => {
    const mid = a.machine_id ?? "unknown";
    acc[mid] = (acc[mid] || 0) + 1;
    return acc;
  }, {});

  const barData = Object.entries(machineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([machine_id, count]) => ({
      name: machine_id.length > 10 ? machine_id.slice(0, 10) + "…" : machine_id,
      count,
    }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Donut */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          By Severity
        </p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={110} height={110}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={50}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={false}
              >
                {donutData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={SEVERITY_COLORS[entry.name] || "#9ca3af"}
                  />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="space-y-1.5">
            {donutData.map(({ name, value }) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: SEVERITY_COLORS[name] || "#9ca3af" }}
                />
                <span className="capitalize text-gray-600 w-16">{name}</span>
                <span className="font-bold text-gray-800 tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar — top alerting machines */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Top Machines by Alert Count
        </p>
        {barData.length === 0 ? (
          <div className="text-gray-300 text-xs">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={110}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                formatter={(v) => [v, "alerts"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar
                dataKey="count"
                fill="#f59e0b"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}