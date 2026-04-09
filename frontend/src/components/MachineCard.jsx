import { Link } from "react-router-dom";
import { Cpu, MapPin, Activity } from "lucide-react";
import StatusDot from "./StatusDot";

const STATUS_LABELS = {
  online: {
    text: "Online",
    cls: "text-green-600 bg-green-50 border-green-200",
  },
  offline: {
    text: "Offline",
    cls: "text-gray-500 bg-gray-50 border-gray-200",
  },
  warning: {
    text: "Warning",
    cls: "text-yellow-600 bg-yellow-50 border-yellow-200",
  },
  error: {
    text: "Error",
    cls: "text-red-600 bg-red-50 border-red-200",
  },
};

export default function MachineCard({ machine }) {
  const statusCfg = STATUS_LABELS[machine.status] || STATUS_LABELS.offline;

  return (
    <Link
      to={`/machines/${machine.machine_id}`}
      className="block bg-white rounded-xl shadow hover:shadow-md transition-shadow duration-200 p-5 border border-gray-100 group"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={18} className="text-blue-500 shrink-0" />
          <span className="font-semibold text-gray-800 truncate group-hover:text-blue-600 transition-colors">
            {machine.name}
          </span>
        </div>
        <StatusDot status={machine.status} />
      </div>

      {/* Meta */}
      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
        <MapPin size={11} className="shrink-0" />
        <span className="truncate">{machine.location || "No location"}</span>
      </p>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Activity size={11} className="shrink-0" />
        <span>{machine.machine_type || "Unknown type"}</span>
      </p>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.cls}`}
        >
          {statusCfg.text}
        </span>
        <span className="text-xs font-mono text-gray-300">{machine.machine_id}</span>
      </div>
    </Link>
  );
}