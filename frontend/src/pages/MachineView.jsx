import React, { useState, useCallback } from "react";
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
import MultiMetricChart from "../components/charts/MultiMetricChart";
import AIInsightPanel from "../components/AIInsightPanel";
import AnomalyStatusCard from "../components/AnomalyStatusCard";
import { MetricTile } from "../components/ui/MetricTile";
import { SkeletonChart } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import AnomalyBadge, { AnomalyScorePill } from "../components/AnomalyBadge";
import LiveBadge from "../components/LiveBadge";
import StatusDot from "../components/StatusDot";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft,
  ChevronDown,
  Terminal,
  Brain,
  AlertTriangle,
  Clock,
  LayoutGrid,
  Activity,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

const REFRESH_MS = 3000;
const ALL_METRICS = Object.keys(METRIC_CONFIG);

const TIME_RANGES = [
  { label: "~5 min", limit: 150 },
  { label: "~15 min", limit: 450 },
  { label: "~1 hr", limit: 900 },
  { label: "Max", limit: 1000 },
];

const TABS = [
  { key: "combined", label: "Combined", icon: Activity, perm: "telemetry" },
  { key: "charts", label: "Per Metric", icon: LayoutGrid, perm: "telemetry" },
  { key: "insights", label: "AI Insights", icon: Brain, perm: "ai_insights" },
  { key: "anomalies", label: "Anomalies", icon: AlertTriangle, perm: "anomalies" },
];

function getThresholdState(metric, value) {
  if (value == null) return {};
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return {};
  if (metric === "oil_level") return { critical: value <= 10, warn: value <= 20 };
  return {
    critical: cfg.critical != null && value >= cfg.critical,
    warn: cfg.warn != null && value >= cfg.warn,
  };
}

export default function MachineView() {
  const { machineId } = useParams();
  const { can } = useAuth();

  const [selectedMetrics, setSelectedMetrics] = useState([
    "temperature",
    "vibration",
    "rpm",
  ]);
  const [activeTab, setActiveTab] = useState("combined");
  const [showTwin, setShowTwin] = useState(false);
  const [timeRange, setTimeRange] = useState(TIME_RANGES[0]);

  const fetchTelemetry = useCallback(
    () => getTelemetryHistory(machineId, timeRange.limit).then((r) => r.data),
    [machineId, timeRange.limit]
  );
  const {
    data: telemetry = [],
    loading: telLoading,
    error: telError,
    refresh,
  } = usePolling(fetchTelemetry, REFRESH_MS, [timeRange.limit]);

  const fetchMachine = useCallback(
    () => getMachine(machineId).then((r) => r.data),
    [machineId]
  );
  const { data: machine } = usePolling(fetchMachine, 10000);

  const fetchAnomaliesData = useCallback(
    () =>
      activeTab === "anomalies"
        ? getAnomalies(machineId, 30).then((r) => r.data)
        : Promise.resolve([]),
    [machineId, activeTab]
  );
  const { data: anomalies = [] } = usePolling(fetchAnomaliesData, 8000, [activeTab]);

  const fetchStats = useCallback(
    () => getAnomalyStats(machineId).then((r) => r.data),
    [machineId]
  );
  const { data: anomalyStats } = usePolling(fetchStats, 10000);

  const fetchTwin = useCallback(
    () =>
      showTwin
        ? getMachineTwin(machineId).then((r) => r.data)
        : Promise.resolve(null),
    [machineId, showTwin]
  );
  const { data: twin } = usePolling(fetchTwin, 5000, [showTwin]);

  const safeTelemetry = telemetry || [];
  const safeAnomalies = anomalies || [];
  const latest = safeTelemetry[0] ?? null;
  const latestScore = latest?.anomaly_score ?? null;

  const scoreTrend = anomalyStats?.score_trend?.trend ?? null;
  const detectorType = anomalyStats?.config?.detector_type ?? null;
  const mlReady = anomalyStats?.config?.ml_model_ready ?? false;
  const sampleCount = anomalyStats?.config?.ml_trained_on ?? 0;

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
        </div>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      {/* Error */}
      {telError && (
        <div className="mb-4">
          <ErrorBanner message={telError} onRetry={refresh} />
        </div>
      )}

      {/* Metric tiles */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
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

      {/* Anomaly Status Card */}
      <div className="mb-5">
        <AnomalyStatusCard
          score={latestScore}
          trend={scoreTrend}
          detectorType={detectorType}
          mlReady={mlReady}
          sampleCount={sampleCount}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-gray-100">
        <div className="flex gap-0">
          {TABS.map(({ key, label, icon: Icon, perm }) => {
            if (!can(perm)) return null;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 ${
                  activeTab === key
                    ? "border-blue-600 text-blue-600"
                    : "text-gray-500"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Combined */}
      {activeTab === "combined" && (
        <MultiMetricChart data={safeTelemetry} height={280} showThresholds />
      )}

      {/* Charts */}
      {activeTab === "charts" && (
        <div className="pt-4">
          {selectedMetrics.map((metric) => (
            <TelemetryChart
              key={metric}
              data={safeTelemetry}
              metric={metric}
              height={200}
              showThresholds
              showAnomalies
            />
          ))}
        </div>
      )}

      {/* Insights */}
      {activeTab === "insights" && (
        <AIInsightPanel
          telemetry={safeTelemetry}
          anomalies={safeAnomalies}
          anomalyStats={anomalyStats}
          machineName={machine?.name ?? machineId}
        />
      )}

      {/* Twin */}
      <div className="mt-6">
        <button onClick={() => setShowTwin((v) => !v)}>
          Toggle Twin
        </button>
        {showTwin && <pre>{JSON.stringify(twin, null, 2)}</pre>}
      </div>
    </div>
  );
}