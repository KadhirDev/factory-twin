import React, { useCallback } from "react";
import { getMachines } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import MachineCard from "../components/MachineCard";
import LiveBadge from "../components/LiveBadge";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { PlusCircle } from "lucide-react";

const REFRESH_MS = 5000;

export default function Dashboard() {
  const fetchFn = useCallback(() => getMachines().then((r) => r.data), []);

  const {
    data: machines = [],
    loading,
    error,
    lastAt,
    refresh,
  } = usePolling(fetchFn, REFRESH_MS);

  const counts = (machines || []).reduce(
    (acc, m) => ({ ...acc, [m.status]: (acc[m.status] || 0) + 1 }),
    {}
  );

  const summary = [
    {
      label: "Total",
      value: machines.length,
      color: "text-blue-600",
      ring: "border-blue-100 bg-blue-50",
    },
    {
      label: "Online",
      value: counts.online || 0,
      color: "text-green-600",
      ring: "border-green-100 bg-green-50",
    },
    {
      label: "Warning",
      value: counts.warning || 0,
      color: "text-yellow-500",
      ring: "border-yellow-100 bg-yellow-50",
    },
    {
      label: "Offline / Error",
      value: (counts.offline || 0) + (counts.error || 0),
      color: "text-red-500",
      ring: "border-red-100 bg-red-50",
    },
  ];

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

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {summary.map(({ label, value, color, ring }) => (
          <div key={label} className={`rounded-xl border p-4 shadow-sm ${ring}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {label}
            </p>
            <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

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
      ) : machines.length === 0 && !error ? (
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
          {machines.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  );
}