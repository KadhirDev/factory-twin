import React, { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Brain,
  AlertTriangle,
  Zap,
  Droplets,
  ThumbsUp,
  GitMerge,
  Clock,
  ShieldAlert,
  Layers,
  Activity,
  Cpu,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { AnomalyScorePill } from "./AnomalyBadge";
import { formatDistanceToNow, parseISO } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectTrend(values = []) {
  if (!values?.length || values.length < 6) return "stable";
  const mid = Math.floor(values.length / 2);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(values.slice(mid)) - avg(values.slice(0, mid));
  const base = Math.abs(avg(values.slice(0, mid))) || 1;
  if (Math.abs(diff) / base > 0.03) return diff > 0 ? "rising" : "falling";
  return "stable";
}

function projectToThreshold(values = [], threshold, risingIsBad = true) {
  if (values.length < 6) return null;
  const slice = values.slice(-10);
  const xMean = (slice.length - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / slice.length;
  let num = 0;
  let den = 0;

  slice.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });

  const slope = den !== 0 ? num / den : 0;
  const last = values[values.length - 1];
  const heading = risingIsBad
    ? slope > 0 && last < threshold
    : slope < 0 && last > threshold;

  if (!heading || Math.abs(slope) < 1e-6) return null;

  const steps = Math.ceil((threshold - last) / slope);
  return steps > 0 && steps < 500 ? steps : null;
}

function detectCorrelations(telemetry = []) {
  const PAIRS = [
    { a: "temperature", b: "vibration", label: "Temperature & Vibration" },
    { a: "temperature", b: "power_consumption", label: "Temperature & Power" },
    { a: "rpm", b: "vibration", label: "RPM & Vibration" },
    { a: "pressure", b: "power_consumption", label: "Pressure & Power" },
  ];

  const safe = telemetry || [];
  if (safe.length < 8) return [];

  return PAIRS.filter(({ a, b }) => {
    const aV = safe.map((d) => d[a]).filter((v) => v != null).reverse();
    const bV = safe.map((d) => d[b]).filter((v) => v != null).reverse();

    return (
      aV.length >= 8 &&
      bV.length >= 8 &&
      detectTrend(aV) === "rising" &&
      detectTrend(bV) === "rising"
    );
  }).map(({ label }) => label);
}

function detectAnomalyFrequencyTrend(telemetry = []) {
  const safe = (telemetry || []).filter((d) => d.is_anomaly != null);
  if (safe.length < 8) return "unknown";

  const mid = Math.floor(safe.length / 2);
  const rate = (arr) => arr.filter((d) => d.is_anomaly).length / arr.length;
  const diff = rate(safe.slice(0, mid)) - rate(safe.slice(mid));

  if (Math.abs(diff) < 0.05) return "stable";
  return diff > 0 ? "increasing" : "decreasing";
}

const METRIC_THRESHOLDS = {
  temperature: { label: "Temperature", unit: "°C", critical: 95 },
  vibration: { label: "Vibration", unit: "", critical: 1.0 },
  pressure: { label: "Pressure", unit: " bar", critical: 9.0 },
  power_consumption: { label: "Power", unit: " kW", critical: 12 },
  rpm: { label: "RPM", unit: " rpm", critical: 2000 },
};

function getTopRiskyMetric(telemetry = []) {
  const latest = (telemetry || [])[0];
  if (!latest) return null;

  let topMetric = null;
  let topPct = 0;

  Object.entries(METRIC_THRESHOLDS).forEach(([key, cfg]) => {
    const val = latest[key];
    if (val == null || !cfg.critical) return;

    const pct = (val / cfg.critical) * 100;
    if (pct > topPct) {
      topPct = pct;
      topMetric = { key, cfg, val, pct: Math.round(pct) };
    }
  });

  return topMetric;
}

function clusterAnomalies(anomalies = []) {
  const safe = (anomalies || [])
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (!safe.length) return [];

  const clusters = [];
  let current = [safe[0]];

  for (let i = 1; i < safe.length; i++) {
    const gap = new Date(safe[i].timestamp) - new Date(safe[i - 1].timestamp);
    if (gap <= 30_000) {
      current.push(safe[i]);
    } else {
      clusters.push(current);
      current = [safe[i]];
    }
  }

  clusters.push(current);
  return clusters.reverse();
}

function generateInsights(telemetry = [], anomalies = [], anomalyStats = null) {
  const insights = [];
  const safe = telemetry || [];
  if (!safe.length) return insights;

  const METRICS_CFG = {
    temperature: {
      label: "Temperature",
      unit: "°C",
      warnVal: 80,
      critVal: 95,
      inverted: false,
    },
    vibration: {
      label: "Vibration",
      unit: "",
      warnVal: 0.5,
      critVal: 1.0,
      inverted: false,
    },
    rpm: {
      label: "RPM",
      unit: " rpm",
      warnVal: 1800,
      critVal: null,
      inverted: false,
    },
    pressure: {
      label: "Pressure",
      unit: " bar",
      warnVal: 7.0,
      critVal: 9.0,
      inverted: false,
    },
    oil_level: {
      label: "Oil level",
      unit: "%",
      warnVal: 20,
      critVal: 10,
      inverted: true,
    },
    power_consumption: {
      label: "Power",
      unit: " kW",
      warnVal: 8.0,
      critVal: 12,
      inverted: false,
    },
  };

  Object.entries(METRICS_CFG).forEach(([key, cfg]) => {
    const values = safe.map((d) => d[key]).filter((v) => v != null).reverse();
    if (values.length < 4) return;

    const trend = detectTrend(values);
    const current = values[values.length - 1];

    if (cfg.inverted) {
      if (current <= (cfg.critVal ?? 0)) {
        insights.push({
          type: "critical",
          icon: Droplets,
          text: `${cfg.label} critically low at ${current.toFixed(
            1
          )}${cfg.unit} — maintenance required immediately.`,
        });
      } else if (trend === "falling") {
        const steps = projectToThreshold(values, cfg.warnVal, false);
        const hint =
          steps != null
            ? ` (~${Math.round((steps * 2) / 60)} min at current rate)`
            : "";
        insights.push({
          type: "warning",
          icon: TrendingDown,
          text: `${cfg.label} trending down (${current.toFixed(
            1
          )}${cfg.unit})${hint} — schedule maintenance.`,
        });
      }
      return;
    }

    const atCrit = cfg.critVal && current >= cfg.critVal;
    const atWarn = cfg.warnVal && current >= cfg.warnVal;
    const nearWarn = cfg.warnVal && current >= cfg.warnVal * 0.82;

    if (atCrit) {
      insights.push({
        type: "critical",
        icon: AlertTriangle,
        text: `${cfg.label} at ${current.toFixed(
          1
        )}${cfg.unit} — critical threshold exceeded.`,
      });
    } else if (atWarn && trend === "rising") {
      insights.push({
        type: "warning",
        icon: TrendingUp,
        text: `${cfg.label} at warning level and still rising (${current.toFixed(
          1
        )}${cfg.unit}).`,
      });
    } else if (!atWarn && nearWarn && trend === "rising") {
      const steps = projectToThreshold(values, cfg.warnVal, true);
      const hint =
        steps != null
          ? ` Projected threshold breach in ~${Math.round(
              (steps * 2) / 60
            )} min.`
          : "";
      insights.push({
        type: "info",
        icon: Clock,
        text: `${cfg.label} approaching warning threshold (${current.toFixed(
          1
        )}${cfg.unit}).${hint}`,
      });
    } else if (key === "rpm" && trend === "falling") {
      insights.push({
        type: "info",
        icon: TrendingDown,
        text: `RPM decreasing — possible load reduction (${current.toFixed(
          0
        )} rpm).`,
      });
    }
  });

  detectCorrelations(safe).forEach((label) => {
    insights.push({
      type: "warning",
      icon: GitMerge,
      text: `${label} rising together — combined stress may accelerate wear.`,
    });
  });

  const afTrend = detectAnomalyFrequencyTrend(safe);
  if (afTrend === "increasing") {
    insights.push({
      type: "warning",
      icon: Zap,
      text: "Anomaly frequency is increasing — system stability degrading.",
    });
  } else if (afTrend === "decreasing") {
    insights.push({
      type: "info",
      icon: Zap,
      text: "Anomaly frequency is decreasing — system stabilising.",
    });
  }

  const safeAnoms = anomalies || [];
  const sampleSize = safe.length;
  const anomRate =
    sampleSize > 0
      ? ((safeAnoms.slice(0, sampleSize).length / sampleSize) * 100).toFixed(1)
      : 0;

  if (safeAnoms.length >= 5) {
    const topScore = Math.max(
      ...safeAnoms.slice(0, 10).map((a) => a.anomaly_score || 0)
    );
    insights.push({
      type: "critical",
      icon: Zap,
      text: `High anomaly rate: ${safeAnoms.length} recent anomalies (${anomRate}%, peak ${topScore.toFixed(
        2
      )}σ).`,
    });
  } else if (safeAnoms.length >= 2) {
    insights.push({
      type: "warning",
      icon: Zap,
      text: `${safeAnoms.length} anomalies recently (${anomRate}%) — monitor sensor patterns.`,
    });
  } else if (safeAnoms.length === 1) {
    insights.push({
      type: "info",
      icon: AlertTriangle,
      text: "1 anomaly detected recently — isolated event, monitor for recurrence.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "ok",
      icon: ThumbsUp,
      text: "All metrics within normal operating ranges. No anomalies detected.",
    });
  }

  return insights;
}

// ── Style map ─────────────────────────────────────────────────────────────────
const STYLES = {
  critical: {
    bar: "bg-red-500",
    wrap: "bg-red-50 border-red-100",
    text: "text-red-700",
    icon: "text-red-500",
  },
  warning: {
    bar: "bg-yellow-400",
    wrap: "bg-yellow-50 border-yellow-100",
    text: "text-yellow-700",
    icon: "text-yellow-500",
  },
  info: {
    bar: "bg-blue-400",
    wrap: "bg-blue-50 border-blue-100",
    text: "text-blue-700",
    icon: "text-blue-500",
  },
  ok: {
    bar: "bg-green-500",
    wrap: "bg-green-50 border-green-100",
    text: "text-green-700",
    icon: "text-green-500",
  },
};

function InsightRow({ insight }) {
  const s = STYLES[insight.type] || STYLES.info;
  const Icon = insight.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${s.wrap}`}>
      <div className={`w-0.5 self-stretch rounded-full shrink-0 ${s.bar}`} />
      <Icon size={15} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <p className={`text-xs leading-relaxed ${s.text}`}>{insight.text}</p>
    </div>
  );
}

function WarmUpBar({ current, target }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Detector warming up…</span>
        <span>
          {current} / {target} samples
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TopRiskyMetric({ telemetry }) {
  const top = getTopRiskyMetric(telemetry);
  if (!top) return null;

  const barColor =
    top.pct >= 100
      ? "bg-red-500"
      : top.pct >= 85
      ? "bg-yellow-400"
      : "bg-blue-400";

  const textColor =
    top.pct >= 100
      ? "text-red-700"
      : top.pct >= 85
      ? "text-yellow-700"
      : "text-blue-700";

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className={textColor} />
          <span className="text-xs font-semibold text-gray-600">
            Top Risk Metric
          </span>
        </div>
        <span className={`text-xs font-bold ${textColor}`}>
          {top.cfg.label}: {top.val.toFixed(2)}
          {top.cfg.unit}
        </span>
      </div>

      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(top.pct, 100)}%` }}
        />
      </div>

      <p className="text-xs text-gray-400 mt-1 text-right">
        {top.pct}% of critical threshold ({top.cfg.critical}
        {top.cfg.unit})
      </p>
    </div>
  );
}

function AnomalyClusters({ anomalies }) {
  const clusters = useMemo(() => clusterAnomalies(anomalies), [anomalies]);
  if (!clusters.length) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Layers size={13} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Anomaly Clusters ({clusters.length})
        </p>
      </div>

      <div className="space-y-1.5">
        {clusters.slice(0, 4).map((cluster, i) => {
          const latest = cluster[cluster.length - 1];
          const topScore = Math.max(
            ...cluster.map((a) => a.anomaly_score || 0)
          );
          const timeAgo = formatDistanceToNow(parseISO(latest.timestamp), {
            addSuffix: true,
          });

          return (
            <div
              key={i}
              className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    topScore >= 4 ? "bg-red-500" : "bg-orange-400"
                  }`}
                />
                <span className="text-orange-700 font-medium">
                  {cluster.length === 1
                    ? "1 reading"
                    : `${cluster.length} readings`}
                </span>
              </div>

              <div className="flex items-center gap-3 text-orange-500">
                <span className="font-mono">peak {topScore.toFixed(2)}σ</span>
                <span className="text-orange-300">{timeAgo}</span>
              </div>
            </div>
          );
        })}

        {clusters.length > 4 && (
          <p className="text-xs text-gray-400 pl-1">
            +{clusters.length - 4} more cluster
            {clusters.length - 4 !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ── NEW: Detector badge ───────────────────────────────────────────────────────
function DetectorBadge({ detectorType, mlModelReady }) {
  const isML = detectorType === "isolation_forest" || mlModelReady;

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
        isML
          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
          : "bg-gray-50 text-gray-500 border-gray-200"
      }`}
    >
      <Cpu size={11} />
      {isML ? "Isolation Forest" : "Z-Score (warming up)"}
    </div>
  );
}

// ── NEW: Score trend indicator ────────────────────────────────────────────────
function ScoreTrendPanel({ scoreTrend }) {
  if (!scoreTrend || !scoreTrend.scores?.length) return null;

  const { trend, recent_avg, peak_score, scores } = scoreTrend;
  const chartData = scores.map((v, i) => ({ i, v }));

  const trendColor =
    trend === "rising"
      ? "text-red-600"
      : trend === "falling"
      ? "text-green-600"
      : "text-gray-500";

  const TrendIcon =
    trend === "rising"
      ? TrendingUp
      : trend === "falling"
      ? TrendingDown
      : Activity;

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">
            Anomaly Score Trend
          </span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon size={12} />
          <span className="capitalize">{trend}</span>
        </div>
      </div>

      <div className="h-10 mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="v"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <RechartsTooltip
              formatter={(value) => [
                `${Number(value).toFixed(3)}σ`,
                "score",
              ]}
              contentStyle={{ fontSize: 10, padding: "2px 6px", borderRadius: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between text-xs text-gray-400 font-mono">
        <span>avg {recent_avg != null ? recent_avg.toFixed(3) : "—"}σ</span>
        <span>peak {peak_score != null ? peak_score.toFixed(3) : "—"}σ</span>
      </div>
    </div>
  );
}

// ── NEW: Feature contributors panel ───────────────────────────────────────────
function FeatureContributors({ anomalies = [] }) {
  const recent = (anomalies || []).find(
    (a) => a.anomaly_details?.top_contributors?.length > 0
  );
  if (!recent) return null;

  const contributors = recent.anomaly_details.top_contributors;
  const timeAgo = formatDistanceToNow(parseISO(recent.timestamp), {
    addSuffix: true,
  });

  return (
    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-orange-500" />
          <span className="text-xs font-semibold text-orange-700">
            Last Anomaly — Contributing Factors
          </span>
        </div>
        <span className="text-xs text-orange-300">{timeAgo}</span>
      </div>

      <div className="space-y-1.5">
        {contributors.map((c, i) => {
          const absZ = Math.abs(c.z_score);
          const isCrit = absZ >= 4.0;
          const isWarn = absZ >= 2.8;
          const barPct = Math.min(100, (absZ / 5.0) * 100);
          const barColor = isCrit
            ? "bg-red-500"
            : isWarn
            ? "bg-orange-400"
            : "bg-yellow-300";

          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium text-orange-800">{c.label}</span>
                <span
                  className={`font-mono text-xs ${
                    isCrit ? "text-red-700" : "text-orange-600"
                  }`}
                >
                  {c.z_score > 0 ? "+" : ""}
                  {c.z_score.toFixed(2)}σ
                </span>
              </div>
              <div className="h-1 bg-orange-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-orange-400 mt-2 italic">
        {contributors[0]?.description}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIInsightPanel({
  telemetry = [],
  anomalies = [],
  anomalyStats = null,
  machineName = "Machine",
}) {
  const insights = useMemo(
    () => generateInsights(telemetry, anomalies, anomalyStats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [telemetry?.length, anomalies?.length, anomalyStats?.anomaly_count]
  );

  const latestScore = (telemetry || [])[0]?.anomaly_score ?? null;
  const totalAnomalies = anomalyStats?.anomaly_count ?? 0;
  const windowStats = anomalyStats?.detector_windows ?? {};
  const windowMetrics = Object.keys(windowStats);
  const minSamples = anomalyStats?.config?.min_samples ?? 50;
  const windowSize = anomalyStats?.config?.window_size ?? 50;
  const threshold = anomalyStats?.config?.anomaly_threshold ?? 2.8;
  const detectorType = anomalyStats?.config?.detector_type ?? "z_score";
  const mlModelReady = anomalyStats?.config?.ml_model_ready ?? false;
  const scoreTrend = anomalyStats?.score_trend ?? null;

  const minCount =
    windowMetrics.length > 0
      ? Math.min(...windowMetrics.map((m) => windowStats[m]?.count ?? 0))
      : 0;

  const isWarmingUp = minCount < minSamples;
  const critCount = insights.filter((i) => i.type === "critical").length;
  const warnCount = insights.filter((i) => i.type === "warning").length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow p-5">
      <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Brain size={18} className="text-indigo-500" />
          <span className="text-sm font-bold text-gray-700">AI Insights</span>
          <span className="text-xs text-gray-400">— {machineName}</span>

          {critCount > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {critCount} critical
            </span>
          )}

          {warnCount > 0 && (
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {warnCount} warning
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DetectorBadge
            detectorType={detectorType}
            mlModelReady={mlModelReady}
          />
          {latestScore != null && <AnomalyScorePill score={latestScore} />}
        </div>
      </div>

      {isWarmingUp && <WarmUpBar current={minCount} target={minSamples} />}

      <ScoreTrendPanel scoreTrend={scoreTrend} />

      <TopRiskyMetric telemetry={telemetry} />

      <FeatureContributors anomalies={anomalies} />

      <div className="space-y-2 mb-4">
        {insights.length === 0 ? (
          <div className="text-xs text-gray-300 py-4 text-center">
            Collecting data for analysis…
          </div>
        ) : (
          insights.map((ins, i) => <InsightRow key={i} insight={ins} />)
        )}
      </div>

      {(anomalies || []).length > 0 && <AnomalyClusters anomalies={anomalies} />}

      {totalAnomalies > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-orange-700">
            <Zap size={13} />
            <span className="font-medium">Anomaly history</span>
          </div>
          <span className="font-bold text-orange-700 tabular-nums">
            {totalAnomalies} total stored
          </span>
        </div>
      )}

      {windowMetrics.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Detector Baselines
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {windowMetrics.map((metric) => {
              const w = windowStats[metric];
              return (
                <div
                  key={metric}
                  className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-xs"
                >
                  <p className="text-gray-500 capitalize font-medium mb-1 truncate">
                    {metric.replace("_", " ")}
                  </p>
                  <p className="font-mono text-gray-700">
                    μ {w.mean?.toFixed(2) ?? "—"}
                  </p>
                  <p className="font-mono text-gray-400">
                    σ {w.std?.toFixed(3) ?? "—"}
                  </p>
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-300 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((w.count || 0) / windowSize) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-gray-300 mt-0.5 tabular-nums">
                    {w.count}/{windowSize}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>
          Anomalies stored:{" "}
          <strong className="text-gray-600">{totalAnomalies}</strong>
        </span>
        <span>
          Threshold: <strong className="text-gray-600">{threshold}σ</strong>
        </span>
      </div>
    </div>
  );
}