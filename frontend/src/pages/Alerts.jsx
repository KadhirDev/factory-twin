import React, { useState, useCallback, useMemo } from "react";
import { getAlerts, acknowledgeAlert } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAuth } from "../context/AuthContext";
import AlertBadge from "../components/AlertBadge";
import LiveBadge from "../components/LiveBadge";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import AlertDistributionChart from "../components/charts/AlertDistributionChart";
import AlertTrendChart from "../components/charts/AlertTrendChart";
import {
  CheckCircle,
  AlertTriangle,
  BellRing,
  BarChart2,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

const REFRESH_MS = 5000;
const ANALYTICS_REFRESH = 20_000;
const ANALYTICS_LIMIT = 200;

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warning" },
  { key: "unacked", label: "Unread" },
];

function detectAlertTrend(alerts = []) {
  if (!alerts?.length || alerts.length < 4) return "stable";
  const sorted = [...alerts].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const mid = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, mid).length;
  const newer = sorted.slice(mid).length;
  const diff = newer - older;
  if (Math.abs(diff) < 2) return "stable";
  return diff > 0 ? "rising" : "falling";
}

function TrendChip({ trend }) {
  if (trend === "rising") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <TrendingUp size={11} /> Rising
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <TrendingDown size={11} /> Falling
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
      <Minus size={11} /> Stable
    </span>
  );
}

export default function Alerts() {
  const [filter, setFilter] = useState("all");
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [analyticsTab, setAnalyticsTab] = useState("trend");

  const buildParams = useCallback((f) => {
    if (f === "unacked") return { unacknowledged_only: true, limit: 200 };
    if (f === "critical") return { severity: "critical", limit: 200 };
    if (f === "warning") return { severity: "warning", limit: 200 };
    return { limit: 200 };
  }, []);

  const fetchAlerts = useCallback(
    () => getAlerts(buildParams(filter)).then((r) => r.data),
    [filter, buildParams]
  );
  const { data: alerts = [], loading, error, refresh } = usePolling(
    fetchAlerts,
    REFRESH_MS,
    [filter]
  );

  const fetchAllAlerts = useCallback(
    () => getAlerts({ limit: ANALYTICS_LIMIT }).then((r) => r.data),
    []
  );
  const { data: allAlerts = [] } = usePolling(fetchAllAlerts, ANALYTICS_REFRESH);

  const analytics = useMemo(() => {
    const safe = allAlerts || [];
    const trend = detectAlertTrend(safe);
    const totalCount = safe.length;
    const critCount = safe.filter((a) => a.severity === "critical").length;
    const warnCount = safe.filter((a) => a.severity === "warning").length;
    const unackedCount = safe.filter((a) => !a.acknowledged).length;
    const ackedPct =
      totalCount > 0
        ? Math.round(((totalCount - unackedCount) / totalCount) * 100)
        : 100;
    return { trend, totalCount, critCount, warnCount, unackedCount, ackedPct };
  }, [allAlerts]);

  const handleAck = async (id) => {
    try {
      await acknowledgeAlert(id);
      refresh();
    } catch (e) {
      console.error("Acknowledge failed:", e);
    }
  };

  const safeAlerts = alerts || [];
  const safeAllAlerts = allAlerts || [];
  const critUnacked = safeAlerts.filter(
    (a) => a.severity === "critical" && !a.acknowledged
  ).length;
  const warnUnacked = safeAlerts.filter(
    (a) => a.severity === "warning" && !a.acknowledged
  ).length;

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Alerts</h1>
          <p className="text-sm text-gray-400 mt-0.5">{safeAlerts.length} result(s)</p>
        </div>
        <LiveBadge intervalSeconds={REFRESH_MS / 1000} />
      </div>

      {/* ── KPI tiles ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
          <BellRing size={22} className="text-red-500 shrink-0" />
          <div>
            <p className="text-xs text-red-400 font-medium">Unread Critical</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">{critUnacked}</p>
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={22} className="text-yellow-500 shrink-0" />
          <div>
            <p className="text-xs text-yellow-500 font-medium">Unread Warning</p>
            <p className="text-2xl font-bold text-yellow-600 tabular-nums">{warnUnacked}</p>
          </div>
        </div>
      </div>

      {/* ── Analytics panel ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <button
          onClick={() => setShowAnalytics((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BarChart2 size={16} className="text-blue-500" />
            Alert Analytics
            <span className="text-xs font-normal text-gray-400 ml-1">
              ({safeAllAlerts.length} records)
            </span>
            <TrendChip trend={analytics.trend} />
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${
              showAnalytics ? "rotate-180" : ""
            }`}
          />
        </button>

        {showAnalytics && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-100">
            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: "Total (last 200)",
                  value: analytics.totalCount,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  label: "Critical",
                  value: analytics.critCount,
                  color: "text-red-600",
                  bg: "bg-red-50",
                },
                {
                  label: "Warning",
                  value: analytics.warnCount,
                  color: "text-yellow-500",
                  bg: "bg-yellow-50",
                },
                {
                  label: "Acknowledged %",
                  value: `${analytics.ackedPct}%`,
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`rounded-xl p-3 ${bg}`}>
                  <p className="text-xs text-gray-500 font-medium">{label}</p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Trend narrative */}
            <div
              className={`rounded-lg border px-4 py-2.5 mb-4 text-xs flex items-center gap-2
                ${
                  analytics.trend === "rising"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : analytics.trend === "falling"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-gray-50 border-gray-200 text-gray-600"
                }`}
            >
              {analytics.trend === "rising" && <TrendingUp size={14} />}
              {analytics.trend === "falling" && <TrendingDown size={14} />}
              {analytics.trend === "stable" && <Minus size={14} />}
              <span>
                {analytics.trend === "rising"
                  ? "Alert frequency is increasing — check recent machine activity."
                  : analytics.trend === "falling"
                  ? "Alert frequency is decreasing — system stabilising."
                  : "Alert frequency is stable."}
              </span>
            </div>

            {/* Sub-tabs: Trend | Distribution */}
            <div className="flex gap-1 border-b border-gray-100 mb-4">
              {[
                { key: "trend", label: "Alert Trend (hourly)" },
                { key: "distribution", label: "Distribution" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAnalyticsTab(key)}
                  className={`text-xs px-3 py-1.5 border-b-2 font-medium transition-colors
                    ${
                      analyticsTab === key
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {analyticsTab === "trend" && (
              <AlertTrendChart alerts={safeAllAlerts} hours={12} height={160} />
            )}
            {analyticsTab === "distribution" && (
              <AlertDistributionChart alerts={safeAllAlerts} />
            )}
          </div>
        )}
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5 border-b border-gray-100 pb-3">
        {SEVERITY_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-sm px-4 py-1.5 rounded-lg transition font-medium
              ${
                filter === key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={refresh} />
        </div>
      )}

      {/* ── Alert list ───────────────────────────────────────────────────────── */}
      {loading && safeAlerts.length === 0 ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : safeAlerts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle size={44} className="mx-auto mb-3 opacity-30 text-green-500" />
          <p className="font-semibold text-gray-500">No alerts</p>
          <p className="text-sm mt-1">System is operating within thresholds.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {safeAlerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onAck={handleAck} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onAck }) {
  const { can } = useAuth();
  const timeAgo = formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true });

  return (
    <div
      className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-opacity
        ${alert.acknowledged ? "opacity-50 border-gray-100" : "border-gray-200 shadow-sm"}`}
    >
      <div
        className={`w-1 self-stretch rounded-full shrink-0
          ${
            alert.severity === "critical"
              ? "bg-red-500"
              : alert.severity === "warning"
              ? "bg-yellow-400"
              : "bg-blue-400"
          }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <AlertBadge severity={alert.severity} />
          <span className="text-sm font-semibold text-gray-700 capitalize">
            {alert.metric?.replace("_", " ")}
          </span>
          {alert.acknowledged && (
            <span className="text-xs text-gray-400 italic">acknowledged</span>
          )}
          <span className="text-xs text-gray-400 ml-auto">{timeAgo}</span>
        </div>
        <p className="text-sm text-gray-600 truncate">{alert.message}</p>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
          <span>
            Value: <strong className="text-gray-600">{alert.value?.toFixed(2)}</strong>
          </span>
          <span>
            Threshold:{" "}
            <strong className="text-gray-600">{alert.threshold?.toFixed(2)}</strong>
          </span>
        </div>
      </div>
      {!alert.acknowledged && can("alerts") && (
        <button
          onClick={() => onAck(alert.id)}
          className="flex items-center gap-1.5 text-xs text-green-600 border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition shrink-0"
        >
          <CheckCircle size={13} />
          Ack
        </button>
      )}
    </div>
  );
}