import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getMachine, getTelemetryHistory, getMachineTwin } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import TelemetryChart, { METRIC_CONFIG } from "../components/TelemetryChart";
import { MetricTile } from "../components/ui/MetricTile";
import { SkeletonChart } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import LiveBadge from "../components/LiveBadge";
import StatusDot from "../components/StatusDot";
import { ArrowLeft, ChevronDown, Terminal } from "lucide-react";

const REFRESH_MS = 3000;
const ALL_METRICS = Object.keys(METRIC_CONFIG);

// Threshold check for MetricTile coloring
function getThresholdState(metric, value) {
  if (value == null) return {};
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return {};

  // oil_level: low is bad (inverted)
  if (metric === "oil_level") {
    return { critical: value <= 10, warn: value <= 20 };
  }

  return {
    critical: cfg.critical != null && value >= cfg.critical,
    warn: cfg.warn != null && value >= cfg.warn,
  };
}

export default function MachineView() {
  const { machineId } = useParams();
  const [selectedMetrics, setSelectedMetrics] = useState([
    "temperature",
    "vibration",
    "rpm",
  ]);
  const [showTwin, setShowTwin] = useState(false);

  // Telemetry history (primary poll)
  const fetchTelemetry = useCallback(
    () => getTelemetryHistory(machineId, 80).then((r) => r.data),
    [machineId]
  );

  const {
    data: telemetry = [],
    loading: telLoading,
    error: telError,
    refresh,
  } = usePolling(fetchTelemetry, REFRESH_MS);

  // Machine metadata (slower poll)
  const fetchMachine = useCallback(
    () => getMachine(machineId).then((r) => r.data),
    [machineId]
  );

  const { data: machine } = usePolling(fetchMachine, 10000);

  // Ditto twin (on-demand, only when panel is open)
  const fetchTwin = useCallback(
    () =>
      showTwin
        ? getMachineTwin(machineId).then((r) => r.data)
        : Promise.resolve(null),
    [machineId, showTwin]
  );

  const { data: twin } = usePolling(fetchTwin, 5000, [showTwin]);

  const latest = telemetry[0] ?? null;

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : [...prev, key]
    );
  };

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-gray-600 mt-1">
          <ArrowLeft size={20} />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {machine && <StatusDot status={machine.status} />}
            <h1 className="text-2xl font-bold text-gray-800 truncate">
              {machine?.name ?? machineId}
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {machine?.machine_id} · {machine?.location ?? "—"} ·{" "}
            <span className="capitalize">{machine?.status ?? "unknown"}</span>
          </p>
        </div>

        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      {/* Error */}
      {telError && (
        <div className="mb-4">
          <ErrorBanner message={telError} onRetry={refresh} />
        </div>
      )}

      {/* Latest readings */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { key: "temperature", label: "Temperature", unit: "°C" },
          { key: "vibration", label: "Vibration", unit: "" },
          { key: "rpm", label: "RPM", unit: "rpm" },
          { key: "pressure", label: "Pressure", unit: "bar" },
          { key: "power_consumption", label: "Power", unit: "kW" },
          { key: "oil_level", label: "Oil Level", unit: "%" },
        ].map(({ key, label, unit }) => {
          const val = latest?.[key];
          const threshold = getThresholdState(key, val);

          return (
            <MetricTile
              key={key}
              label={label}
              value={val}
              unit={unit}
              warn={threshold.warn}
              critical={threshold.critical}
            />
          );
        })}
      </div>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-xs font-medium text-gray-500 mr-1">
          Show metrics:
        </span>
        {ALL_METRICS.map((key) => {
          const cfg = METRIC_CONFIG[key];
          const active = selectedMetrics.includes(key);

          return (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium
                ${
                  active
                    ? "text-white border-transparent"
                    : "text-gray-500 border-gray-200 bg-white hover:border-gray-300"
                }`}
              style={
                active
                  ? { backgroundColor: cfg.color, borderColor: cfg.color }
                  : {}
              }
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Charts grid */}
      {telLoading && telemetry.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {[...Array(3)].map((_, i) => (
            <SkeletonChart key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {selectedMetrics.map((metric) => (
            <TelemetryChart
              key={metric}
              data={telemetry}
              metric={metric}
              height={200}
              showThresholds
            />
          ))}
        </div>
      )}

      {/* Ditto Twin collapsible panel */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowTwin((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-600"
        >
          <div className="flex items-center gap-2">
            <Terminal size={15} />
            Eclipse Ditto — Live Twin State
          </div>
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              showTwin ? "rotate-180" : ""
            }`}
          />
        </button>

        {showTwin && (
          <div className="bg-gray-900 text-green-400 p-4 font-mono text-xs overflow-auto max-h-72">
            {twin ? (
              <pre>{JSON.stringify(twin, null, 2)}</pre>
            ) : (
              <span className="text-gray-500">Loading twin state...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}