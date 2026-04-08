import { useEffect, useState } from "react";
import { getAlerts, acknowledgeAlert } from "../api/client";
import AlertBadge from "../components/AlertBadge";
import { CheckCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchAlerts = async () => {
    const params = filter === "unacked" ? { unacknowledged_only: true } : {};
    const { data } = await getAlerts(params);
    setAlerts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 5000);
    return () => clearInterval(iv);
  }, [filter]);

  const handleAck = async (id) => {
    await acknowledgeAlert(id);
    fetchAlerts();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Alerts</h1>
        <div className="flex gap-2">
          {["all", "unacked"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "All" : "Unacknowledged"}
            </button>
          ))}
          <button
            onClick={fetchAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          ✅ No alerts found.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white rounded-xl shadow border p-4 flex items-start justify-between gap-4 ${
                alert.acknowledged ? "opacity-60" : "border-gray-100"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <AlertBadge severity={alert.severity} />
                  <span className="text-sm font-medium text-gray-700">{alert.metric}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Value: <strong>{alert.value?.toFixed(2)}</strong> · Threshold:{" "}
                  <strong>{alert.threshold?.toFixed(2)}</strong>
                </p>
              </div>
              {!alert.acknowledged && (
                <button
                  onClick={() => handleAck(alert.id)}
                  className="flex items-center gap-1.5 text-xs text-green-600 border border-green-200 px-2 py-1.5 rounded-lg hover:bg-green-50 transition whitespace-nowrap"
                >
                  <CheckCircle size={13} /> Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}