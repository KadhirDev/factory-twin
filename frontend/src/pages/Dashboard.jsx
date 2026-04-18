import React, { useCallback } from "react";
import { getMachines } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useTelemetryCache } from "../context/TelemetryContext";
import MachineCard from "../components/MachineCard";
import LiveBadge from "../components/LiveBadge";
import TelemetrySparkline from "../components/charts/TelemetrySparkline";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import FleetAnomalySummary from "../components/FleetAnomalySummary";
import { PlusCircle, Activity, Cpu, AlertTriangle, WifiOff } from "lucide-react";

const REFRESH_MS = 5000;

// ── Fleet health bar ──────────────────────────────────────────────────────────
function FleetHealthBar({ machines }) {
  const total = machines?.length || 0;
  if (total === 0) return null;

  const online = machines.filter((m) => m.status === "online").length;
  const warning = machines.filter((m) => m.status === "warning").length;
  const offline = machines.filter(
    (m) => m.status === "offline" || m.status === "error"
  ).length;

  const pct = (n) => ((n / total) * 100).toFixed(1);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Fleet Health
        </span>
        <span className="text-xs text-gray-400">
          {total} machine{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex rounded-full overflow-hidden h-3 bg-gray-100 mb-2">
        {online > 0 && (
          <div className="bg-green-500" style={{ width: `${pct(online)}%` }} />
        )}
        {warning > 0 && (
          <div className="bg-yellow-400" style={{ width: `${pct(warning)}%` }} />
        )}
        {offline > 0 && (
          <div className="bg-red-400" style={{ width: `${pct(offline)}%` }} />
        )}
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        {[
          { label: "Online", count: online, color: "bg-green-500" },
          { label: "Warning", count: warning, color: "bg-yellow-400" },
          { label: "Offline", count: offline, color: "bg-red-400" },
        ].map(({ label, count, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Activity summary ──────────────────────────────────────────────────────────
function ActivitySummary({ machines }) {
  const safe = machines || [];

  const online = safe.filter((m) => m.status === "online").length;
  const warning = safe.filter((m) => m.status === "warning").length;
  const offline = safe.filter(
    (m) => m.status === "offline" || m.status === "error"
  ).length;

  const total = safe.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { icon: Cpu, label: "Total Registered", value: total, color: "text-blue-600", bg: "bg-blue-50" },
        { icon: Activity, label: "Active / Online", value: online, color: "text-green-600", bg: "bg-green-50" },
        { icon: AlertTriangle, label: "In Warning State", value: warning, color: "text-yellow-500", bg: "bg-yellow-50" },
        { icon: WifiOff, label: "Offline / Error", value: offline, color: "text-red-500", bg: "bg-red-50" },
      ].map(({ icon: Icon, label, value, color, bg }) => (
        <div key={label} className={`rounded-xl p-4 shadow-sm ${bg}`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon size={15} className={color} />
            <p className="text-xs font-semibold text-gray-500 uppercase">{label}</p>
          </div>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Machine card with anomaly score ───────────────────────────────────────────
function MachineCardWithSparkline({ machine }) {
  const { getTelemetry } = useTelemetryCache();
  const telemetry = getTelemetry(machine.machine_id);

  const latest = telemetry?.[0];
  const temp = latest?.temperature;
  const isAnomaly = latest?.is_anomaly;
  const anomScore = latest?.anomaly_score;

  const showScore = anomScore != null && anomScore >= 1.5;

  return (
    <div className={`bg-white rounded-xl border shadow ${isAnomaly ? "border-orange-300" : "border-gray-100"}`}>
      <MachineCard machine={machine} />

      <div className="px-5 pb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Activity size={11} />
            Temperature
          </span>

          <div className="flex gap-2">
            {showScore && (
              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded">
                {anomScore.toFixed(2)}σ
              </span>
            )}

            {temp != null && (
              <span className="text-xs font-mono">
                {temp.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>

        <TelemetrySparkline
          data={telemetry || []}
          metric="temperature"
          color={isAnomaly ? "#f97316" : "#3b82f6"}
          height={36}
        />
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const fetchFn = useCallback(() => getMachines().then((r) => r.data), []);

  const { data: machines = [], loading, error, lastAt, refresh } =
    usePolling(fetchFn, REFRESH_MS);

  const safeMachines = machines || [];
  const { getLatest } = useTelemetryCache();

  const sortedMachines = [...safeMachines].sort((a, b) => {
    const aScore = getLatest?.(a.machine_id)?.anomaly_score ?? 0;
    const bScore = getLatest?.(b.machine_id)?.anomaly_score ?? 0;
    return bScore - aScore;
  });

  return (
    <div className="p-6 max-w-screen-xl mx-auto">

      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Factory Dashboard</h1>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      <ActivitySummary machines={safeMachines} />
      {safeMachines.length > 0 && <FleetHealthBar machines={safeMachines} />}
      {safeMachines.length > 0 && <FleetAnomalySummary machines={safeMachines} />}

      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {sortedMachines.map((m) => (
            <MachineCardWithSparkline key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  );
}import React, { useCallback } from "react";
import { getMachines } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useTelemetryCache } from "../context/TelemetryContext";
import MachineCard from "../components/MachineCard";
import LiveBadge from "../components/LiveBadge";
import TelemetrySparkline from "../components/charts/TelemetrySparkline";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import FleetAnomalySummary from "../components/FleetAnomalySummary";
import { PlusCircle, Activity, Cpu, AlertTriangle, WifiOff } from "lucide-react";

const REFRESH_MS = 5000;

// ── Fleet health bar ──────────────────────────────────────────────────────────
function FleetHealthBar({ machines }) {
  const total = machines?.length || 0;
  if (total === 0) return null;

  const online = machines.filter((m) => m.status === "online").length;
  const warning = machines.filter((m) => m.status === "warning").length;
  const offline = machines.filter(
    (m) => m.status === "offline" || m.status === "error"
  ).length;

  const pct = (n) => ((n / total) * 100).toFixed(1);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Fleet Health
        </span>
        <span className="text-xs text-gray-400">
          {total} machine{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex rounded-full overflow-hidden h-3 bg-gray-100 mb-2">
        {online > 0 && (
          <div className="bg-green-500" style={{ width: `${pct(online)}%` }} />
        )}
        {warning > 0 && (
          <div className="bg-yellow-400" style={{ width: `${pct(warning)}%` }} />
        )}
        {offline > 0 && (
          <div className="bg-red-400" style={{ width: `${pct(offline)}%` }} />
        )}
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        {[
          { label: "Online", count: online, color: "bg-green-500" },
          { label: "Warning", count: warning, color: "bg-yellow-400" },
          { label: "Offline", count: offline, color: "bg-red-400" },
        ].map(({ label, count, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Activity summary ──────────────────────────────────────────────────────────
function ActivitySummary({ machines }) {
  const safe = machines || [];

  const online = safe.filter((m) => m.status === "online").length;
  const warning = safe.filter((m) => m.status === "warning").length;
  const offline = safe.filter(
    (m) => m.status === "offline" || m.status === "error"
  ).length;

  const total = safe.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { icon: Cpu, label: "Total Registered", value: total, color: "text-blue-600", bg: "bg-blue-50" },
        { icon: Activity, label: "Active / Online", value: online, color: "text-green-600", bg: "bg-green-50" },
        { icon: AlertTriangle, label: "In Warning State", value: warning, color: "text-yellow-500", bg: "bg-yellow-50" },
        { icon: WifiOff, label: "Offline / Error", value: offline, color: "text-red-500", bg: "bg-red-50" },
      ].map(({ icon: Icon, label, value, color, bg }) => (
        <div key={label} className={`rounded-xl p-4 shadow-sm ${bg}`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon size={15} className={color} />
            <p className="text-xs font-semibold text-gray-500 uppercase">{label}</p>
          </div>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Machine card with anomaly score ───────────────────────────────────────────
function MachineCardWithSparkline({ machine }) {
  const { getTelemetry } = useTelemetryCache();
  const telemetry = getTelemetry(machine.machine_id);

  const latest = telemetry?.[0];
  const temp = latest?.temperature;
  const isAnomaly = latest?.is_anomaly;
  const anomScore = latest?.anomaly_score;

  const showScore = anomScore != null && anomScore >= 1.5;

  return (
    <div className={`bg-white rounded-xl border shadow ${isAnomaly ? "border-orange-300" : "border-gray-100"}`}>
      <MachineCard machine={machine} />

      <div className="px-5 pb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Activity size={11} />
            Temperature
          </span>

          <div className="flex gap-2">
            {showScore && (
              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded">
                {anomScore.toFixed(2)}σ
              </span>
            )}

            {temp != null && (
              <span className="text-xs font-mono">
                {temp.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>

        <TelemetrySparkline
          data={telemetry || []}
          metric="temperature"
          color={isAnomaly ? "#f97316" : "#3b82f6"}
          height={36}
        />
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const fetchFn = useCallback(() => getMachines().then((r) => r.data), []);

  const { data: machines = [], loading, error, lastAt, refresh } =
    usePolling(fetchFn, REFRESH_MS);

  const safeMachines = machines || [];
  const { getLatest } = useTelemetryCache();

  const sortedMachines = [...safeMachines].sort((a, b) => {
    const aScore = getLatest?.(a.machine_id)?.anomaly_score ?? 0;
    const bScore = getLatest?.(b.machine_id)?.anomaly_score ?? 0;
    return bScore - aScore;
  });

  return (
    <div className="p-6 max-w-screen-xl mx-auto">

      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Factory Dashboard</h1>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      <ActivitySummary machines={safeMachines} />
      {safeMachines.length > 0 && <FleetHealthBar machines={safeMachines} />}
      {safeMachines.length > 0 && <FleetAnomalySummary machines={safeMachines} />}

      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {sortedMachines.map((m) => (
            <MachineCardWithSparkline key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  );
}