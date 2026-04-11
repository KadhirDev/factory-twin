import React, { useCallback } from "react";
import { getMachines, getTelemetryHistory } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import MachineCard from "../components/MachineCard";
import LiveBadge from "../components/LiveBadge";
import TelemetrySparkline from "../components/charts/TelemetrySparkline";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { PlusCircle, Activity, Cpu, AlertTriangle, WifiOff } from "lucide-react";

const REFRESH_MS = 5000;

// ── Fleet health segmented bar ────────────────────────────────────────────────
function FleetHealthBar({ machines }) {
  const total = machines?.length || 0;
  if (total === 0) return null;

  const online = machines.filter((m) => m.status === "online").length;
  const warning = machines.filter((m) => m.status === "warning").length;
  const offline = machines.filter((m) => m.status === "offline" || m.status === "error").length;
  const pct = (n) => ((n / total) * 100).toFixed(1);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Fleet Health
        </span>
        <span className="text-xs text-gray-400">{total} machine{total !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex rounded-full overflow-hidden h-3 bg-gray-100 mb-2">
        {online > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${pct(online)}%` }}
            title={`Online: ${online}`}
          />
        )}
        {warning > 0 && (
          <div
            className="bg-yellow-400 transition-all duration-500"
            style={{ width: `${pct(warning)}%` }}
            title={`Warning: ${warning}`}
          />
        )}
        {offline > 0 && (
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${pct(offline)}%` }}
            title={`Offline: ${offline}`}
          />
        )}
      </div>
      <div className="flex gap-4 text-xs text-gray-500">
        {[
          { label: "Online", count: online, color: "bg-green-500" },
          { label: "Warning", count: warning, color: "bg-yellow-400" },
          { label: "Offline", count: offline, color: "bg-red-400" },
        ].map(({ label, count, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${color}`} />
            {label} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Machine state activity summary ────────────────────────────────────────────
function ActivitySummary({ machines }) {
  const safe = machines || [];
  const online = safe.filter((m) => m.status === "online").length;
  const warning = safe.filter((m) => m.status === "warning").length;
  const offline = safe.filter((m) => m.status === "offline" || m.status === "error").length;
  const total = safe.length;

  const items = [
    {
      icon: Cpu,
      label: "Total Registered",
      value: total,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: Activity,
      label: "Active / Online",
      value: online,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: AlertTriangle,
      label: "In Warning State",
      value: warning,
      color: "text-yellow-500",
      bg: "bg-yellow-50",
    },
    {
      icon: WifiOff,
      label: "Offline / Error",
      value: offline,
      color: "text-red-500",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {items.map(({ icon: Icon, label, value, color, bg }) => (
        <div key={label} className={`rounded-xl border p-4 shadow-sm ${bg} border-transparent`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon size={15} className={color} />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
              {label}
            </p>
          </div>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Machine card with inline sparkline ────────────────────────────────────────
function MachineCardWithSparkline({ machine }) {
  const fetchTelemetry = useCallback(
    () => getTelemetryHistory(machine.machine_id, 20).then((r) => r.data),
    [machine.machine_id]
  );
  const { data: telemetry = [] } = usePolling(fetchTelemetry, 6000);

  const latest = (telemetry || [])[0];
  const temp = latest?.temperature;
  const isAnomaly = latest?.is_anomaly;

  return (
    <div
      className={`bg-white rounded-xl border shadow hover:shadow-md transition-shadow duration-200
        ${isAnomaly ? "border-orange-300" : "border-gray-100"}`}
    >
      <MachineCard machine={machine} />
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Activity size={11} />
            Temperature
          </span>
          {temp != null && (
            <span
              className={`text-xs font-mono font-semibold tabular-nums
                ${temp >= 95 ? "text-red-600" : temp >= 80 ? "text-yellow-500" : "text-gray-600"}`}
            >
              {temp.toFixed(1)}°C
            </span>
          )}
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

// ── Dashboard page ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const fetchFn = useCallback(() => getMachines().then((r) => r.data), []);

  const {
    data: machines = [],
    loading,
    error,
    lastAt,
    refresh,
  } = usePolling(fetchFn, REFRESH_MS);

  const safeMachines = machines || [];

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Factory Dashboard</h1>
          {lastAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              Updated {lastAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      {/* Activity summary — 4 stat tiles */}
      <ActivitySummary machines={safeMachines} />

      {/* Fleet health segmented bar */}
      {safeMachines.length > 0 && <FleetHealthBar machines={safeMachines} />}

      {/* Error */}
      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} onRetry={refresh} />
        </div>
      )}

      {/* Machine grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : safeMachines.length === 0 && !error ? (
        <div className="text-center py-20 text-gray-400">
          <PlusCircle size={44} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-gray-500">No machines registered</p>
          <p className="text-sm mt-1">
            Use{" "}
            <code className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">
              POST /api/v1/machines/
            </code>{" "}
            to register your first machine.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {safeMachines.map((m) => (
            <MachineCardWithSparkline key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  );
}