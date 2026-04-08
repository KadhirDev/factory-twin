import { useEffect, useState } from "react";
import { getMachines } from "../api/client";
import MachineCard from "../components/MachineCard";
import { RefreshCw, ServerCrash } from "lucide-react";

export default function Dashboard() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchMachines = async () => {
    try {
      const { data } = await getMachines();
      setMachines(data);
      setError(null);
    } catch (e) {
      setError("Failed to load machines. Is the backend running?");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    fetchMachines();
    const interval = setInterval(fetchMachines, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusCounts = machines.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Factory Dashboard</h1>
          <p className="text-sm text-gray-400">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchMachines}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Machines", value: machines.length, color: "text-blue-600" },
          { label: "Online", value: statusCounts.online || 0, color: "text-green-600" },
          { label: "Warning", value: statusCounts.warning || 0, color: "text-yellow-500" },
          { label: "Offline / Error", value: (statusCounts.offline || 0) + (statusCounts.error || 0), color: "text-red-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl shadow p-4 border border-gray-100">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-center gap-2 mb-4">
          <ServerCrash size={18} /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading machines...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {machines.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
          {machines.length === 0 && (
            <div className="col-span-full text-center text-gray-400 py-12">
              No machines registered yet. Create machines via the API.
            </div>
          )}
        </div>
      )}
    </div>
  );
}