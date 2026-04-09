/**
 * Animated status indicator dot.
 * Pulses when online to show live data, static when not.
 */
const COLORS = {
  online:  { ring: "ring-green-400",  dot: "bg-green-500",  pulse: true  },
  warning: { ring: "ring-yellow-400", dot: "bg-yellow-400", pulse: true  },
  error:   { ring: "ring-red-400",    dot: "bg-red-500",    pulse: false },
  offline: { ring: "ring-gray-300",   dot: "bg-gray-400",   pulse: false },
};

export default function StatusDot({ status = "offline", size = "md" }) {
  const cfg = COLORS[status] || COLORS.offline;
  const sz = size === "sm" ? "w-2 h-2" : "w-3 h-3";

  return (
    <span className={`relative inline-flex ${sz}`}>
      {cfg.pulse && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`}
        />
      )}
      <span className={`relative inline-flex rounded-full ${sz} ${cfg.dot}`} />
    </span>
  );
}