/**
 * Single metric display tile — used in machine detail header.
 * Shows value, label, and optional threshold warning color.
 */
export function MetricTile({ label, value, unit = "", warn = false, critical = false }) {
  const color = critical
    ? "text-red-600"
    : warn
    ? "text-yellow-500"
    : "text-gray-800";

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-3 text-center
        ${critical ? "border-red-300 bg-red-50" : warn ? "border-yellow-300 bg-yellow-50" : "border-gray-100"}`}
    >
      <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>
        {value !== null && value !== undefined ? Number(value).toFixed(1) : "—"}
        {value !== null && value !== undefined && unit && (
          <span className="text-sm font-normal text-gray-400 ml-0.5">{unit}</span>
        )}
      </p>
    </div>
  );
}