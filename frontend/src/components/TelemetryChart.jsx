import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { format } from "date-fns";

const METRICS = [
  { key: "temperature", color: "#ef4444", label: "Temp (°C)" },
  { key: "vibration", color: "#f97316", label: "Vibration" },
  { key: "rpm", color: "#3b82f6", label: "RPM" },
  { key: "pressure", color: "#8b5cf6", label: "Pressure" },
  { key: "power_consumption", color: "#10b981", label: "Power (kW)" },
];

export default function TelemetryChart({ data = [], metric = "temperature" }) {
  const m = METRICS.find((m) => m.key === metric) || METRICS[0];

  const chartData = [...data]
    .reverse()
    .map((d) => ({
      time: format(new Date(d.timestamp), "HH:mm:ss"),
      value: d[metric],
    }));

  return (
    <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{m.label}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v) => [v?.toFixed(2), m.label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={m.color}
            dot={false}
            strokeWidth={2}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}