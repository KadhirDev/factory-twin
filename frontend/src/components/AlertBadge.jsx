const COLORS = {
  critical: "bg-red-100 text-red-700 border-red-300",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-300",
  info: "bg-blue-100 text-blue-700 border-blue-300",
};

export default function AlertBadge({ severity }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
        COLORS[severity] || COLORS.info
      }`}
    >
      {severity}
    </span>
  );
}