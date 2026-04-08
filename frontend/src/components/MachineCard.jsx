import { Link } from "react-router-dom";
import { Cpu, MapPin, Activity } from "lucide-react";

const STATUS_COLORS = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  warning: "bg-yellow-400",
  error: "bg-red-500",
};

export default function MachineCard({ machine }) {
  return (
    <Link
      to={`/machines/${machine.machine_id}`}
      className="block bg-white rounded-xl shadow hover:shadow-md transition p-5 border border-gray-100"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={20} className="text-blue-500" />
          <span className="font-semibold text-gray-800">{machine.name}</span>
        </div>
        <span
          className={`inline-block w-3 h-3 rounded-full ${STATUS_COLORS[machine.status] || "bg-gray-300"}`}
          title={machine.status}
        />
      </div>
      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
        <MapPin size={12} /> {machine.location || "Unknown location"}
      </p>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Activity size={12} /> {machine.machine_type || "—"}
      </p>
      <div className="mt-3 flex justify-between text-xs text-gray-500">
        <span className="capitalize">{machine.status}</span>
        <span className="font-mono text-gray-400">{machine.machine_id}</span>
      </div>
    </Link>
  );
}