import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getMachine, getTelemetryHistory, getMachineTwin } from "../api/client";
import TelemetryChart from "../components/TelemetryChart";
import { ArrowLeft, RefreshCw } from "lucide-react";

const METRICS = ["temperature", "vibration", "rpm", "pressure", "power_consumption"];

export default function MachineView() {
  const { machineId } = useParams();
  const [machine, setMachine] = useState(null);
  const [telemetry, setTelemetry] = useState([]);
  const [twin, setTwin] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [mRes, tRes] = await Promise.all([
        getMachine(machineId),
        getTelemetryHistory(machineId, 60),
      ]);
      setMachine(mRes.data);
      setTelemetry(tRes.data);
      try {
        const twRes = await getMachineTwin(machineId);
        setTwin(twRes.data);
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [machineId]);

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!machine) return <div className="p-6 text-red-500">Machine not found.</div>;

  const latest = telemetry[0];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{machine.name}</h1>
          <p className="text-sm text-gray-400">{machine.machine_id} · {machine.location}</p>
        </div>
        <button
          onClick={fetchAll}
          className="ml-auto flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Latest readings */}
      {latest && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Temp (°C)", value: latest.temperature },
            { label: "Vibration", value: latest.vibration },
            { label: "RPM", value: latest.rpm },
            { label: "Pressure", value: latest.pressure },
            { label: "Power (kW)", value: latest.power_consumption },
            { label: "Oil Level (%)", value: latest.oil_level },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl shadow p-3 border border-gray-100 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xl font-bold text-gray-800 mt-1">
                {value !== null && value !== undefined ? value.toFixed(1) : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {METRICS.map((m) => (
          <TelemetryChart key={m} data={telemetry} metric={m} />
        ))}
      </div>

      {/* Ditto Twin JSON */}
      {twin && (
        <div className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs font-mono overflow-auto max-h-72">
          <p className="text-gray-400 mb-2 text-xs">Eclipse Ditto — Live Twin State</p>
          <pre>{JSON.stringify(twin, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}