import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getMachine,
  getTelemetryHistory,
  getMachineTwin,
  getAnomalies,
  getAnomalyStats,
} from "../api/client";
import { usePolling } from "../hooks/usePolling";
import TelemetryChart, { METRIC_CONFIG } from "../components/TelemetryChart";
import { MetricTile } from "../components/ui/MetricTile";
import { SkeletonChart } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import AnomalyBadge, { AnomalyScorePill } from "../components/AnomalyBadge";
import LiveBadge from "../components/LiveBadge";
import StatusDot from "../components/StatusDot";
import { ArrowLeft, ChevronDown, Terminal, Brain, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

const REFRESH_MS = 3000;
const ALL_METRICS = Object.keys(METRIC_CONFIG);

function getThresholdState(metric, value) {
  if (value == null) return {};
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return {};
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
  const [activeTab, setActiveTab] = useState("charts");
  const [showTwin, setShowTwin] = useState(false);

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

  const fetchMachine = useCallback(
    () => getMachine(machineId).then((r) => r.data),
    [machineId]
  );
  const { data: machine } = usePolling(fetchMachine, 10_000);

  const fetchAnomaliesData = useCallback(
    () =>
      activeTab === "anomalies"
        ? getAnomalies(machineId, 30).then((r) => r.data)
        : Promise.resolve([]),
    [machineId, activeTab]
  );
  const { data: anomalies = [] } = usePolling(fetchAnomaliesData, 8_000, [activeTab]);

  const fetchStats = useCallback(
    () => getAnomalyStats(machineId).then((r) => r.data),
    [machineId]
  );
  const { data: anomalyStats } = usePolling(fetchStats, 15_000);

  const fetchTwin = useCallback(
    () =>
      showTwin
        ? getMachineTwin(machineId).then((r) => r.data)
        : Promise.resolve(null),
    [machineId, showTwin]
  );
  const { data: twin } = usePolling(fetchTwin, 5_000, [showTwin]);

  const latest = telemetry[0] ?? null;
  const latestScore = latest?.anomaly_score ?? null;

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
      <div className="flex items-start gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-gray-600 mt-1 shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {machine && <StatusDot status={machine.status} />}
            <h1 className="text-2xl font-bold text-gray-800 truncate">
              {machine?.name ?? machineId}
            </h1>
            {latestScore != null && <AnomalyBadge score={latestScore} />}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {machine?.machine_id} · {machine?.location ?? "—"} ·{" "}
            <span className="capitalize">{machine?.status ?? "unknown"}</span>
          </p>
        </div>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      {telError && (
        <div className="mb-4">
          <ErrorBanner message={telError} onRetry={refresh} />
        </div>
      )}

      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-700">AI Anomaly Detector</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Current score:</span>
          {latestScore != null ? (
            <AnomalyScorePill score={latestScore} />
          ) : (
            <span className="text-gray-300 text-xs">warming up...</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Total anomalies:</span>
          <span className="font-bold text-indigo-700">
            {anomalyStats?.anomaly_count ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Window:</span>
          <span className="text-gray-600">
            {anomalyStats?.config?.window_size ?? 60} samples · threshold{" "}
            {anomalyStats?.config?.anomaly_threshold ?? 2.8}σ
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
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

      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {[
          { key: "charts", label: "Live Charts" },
          { key: "anomalies", label: "Anomaly History" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors
              ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "charts" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <span className="text-xs font-medium text-gray-400 mr-1">Metrics:</span>
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
                  style={active ? { backgroundColor: cfg.color } : {}}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {telLoading && telemetry.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
              {[...Array(3)].map((_, i) => (
                <SkeletonChart key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
              {selectedMetrics.map((metric) => (
                <TelemetryChart
                  key={metric}
                  data={telemetry}
                  metric={metric}
                  height={200}
                  showThresholds
                  showAnomalies
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "anomalies" && (
        <div className="mb-5">
          {anomalies.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Brain size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-500">No anomalies detected yet</p>
              <p className="text-sm mt-1">
                The AI detector needs ~{anomalyStats?.config?.min_samples ?? 15} samples to warm up.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {anomalies.map((row) => (
                <AnomalyRow key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>
      )}

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
            className={`transition-transform duration-200 ${showTwin ? "rotate-180" : ""}`}
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

function AnomalyRow({ row }) {
  const [expanded, setExpanded] = useState(false);
  const timeAgo = formatDistanceToNow(parseISO(row.timestamp), { addSuffix: true });
  const details = row.anomaly_details?.metrics ?? {};

  return (
    <div className="bg-white rounded-xl border border-orange-100 shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-orange-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <AlertTriangle size={16} className="text-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <AnomalyBadge score={row.anomaly_score} showScore />
            <span className="text-xs text-gray-400">{timeAgo}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
          <span className="font-mono">T={row.temperature?.toFixed(1)}°</span>
          <span className="font-mono">V={row.vibration?.toFixed(3)}</span>
          <span className="font-mono">RPM={row.rpm?.toFixed(0)}</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-orange-100 px-4 py-3 bg-orange-50">
          <p className="text-xs font-semibold text-gray-600 mb-2">Per-metric z-scores:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(details).map(([metric, info]) => (
              <div
                key={metric}
                className="bg-white rounded-lg p-2.5 border border-orange-100 text-xs"
              >
                <p className="font-medium text-gray-600 capitalize mb-1">
                  {metric.replace("_", " ")}
                </p>
                <p className="text-gray-800 font-mono">
                  value: <strong>{info.value?.toFixed(3)}</strong>
                </p>
                <p className="text-gray-500 font-mono">
                  mean: {info.mean?.toFixed(3)} ± {info.std?.toFixed(3)}
                </p>
                <p
                  className={`font-mono font-bold mt-1 ${
                    Math.abs(info.z_score) >= 4.0
                      ? "text-red-600"
                      : Math.abs(info.z_score) >= 2.8
                      ? "text-orange-600"
                      : "text-gray-400"
                  }`}
                >
                  z = {info.z_score?.toFixed(3)}σ
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}