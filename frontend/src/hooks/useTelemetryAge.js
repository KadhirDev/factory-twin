/**
 * useTelemetryAge
 *
 * Derives telemetry freshness state from the latest reading's timestamp.
 * Ticks every second client-side — no backend changes required.
 *
 * States:
 *   online   — last reading < 15s ago (normal)
 *   delayed  — last reading 15–60s ago (warn, but data may still be useful)
 *   offline  — last reading > 60s ago  (suppress escalation, show "last known state")
 *   unknown  — no timestamp available  (treated as offline)
 */

import { useState, useEffect } from "react";

export const STALE_DELAYED_S = 15;
export const STALE_OFFLINE_S = 60;

/**
 * @param {Array} telemetry – newest-first telemetry array from API
 * @returns {{ ageSeconds: number, isDelayed: boolean, isOffline: boolean, isStale: boolean, ageLabel: string }}
 */
export function useTelemetryAge(telemetry = []) {
  const latestTimestamp = (telemetry || [])[0]?.timestamp ?? null;
  const [ageSeconds, setAgeSeconds] = useState(0);

  useEffect(() => {
    if (!latestTimestamp) {
      // No timestamp at all — treat as unknown/offline
      setAgeSeconds(Infinity);
      return;
    }

    let parsed;
    try {
      parsed = new Date(latestTimestamp);
      if (isNaN(parsed.getTime())) {
        setAgeSeconds(Infinity);
        return;
      }
    } catch {
      setAgeSeconds(Infinity);
      return;
    }

    const tick = () => {
      const age = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
      setAgeSeconds(age);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [latestTimestamp]);

  const isDelayed = isFinite(ageSeconds) && ageSeconds > STALE_DELAYED_S && ageSeconds <= STALE_OFFLINE_S;
  const isOffline = !isFinite(ageSeconds) || ageSeconds > STALE_OFFLINE_S;
  const isStale   = isDelayed || isOffline;

  // Human-readable age label
  let ageLabel = "recently";
  if (!isFinite(ageSeconds) || ageSeconds === 0) {
    ageLabel = latestTimestamp ? "just now" : "no data";
  } else if (ageSeconds >= 3600) {
    ageLabel = `${Math.floor(ageSeconds / 3600)}h ${Math.floor((ageSeconds % 3600) / 60)}m ago`;
  } else if (ageSeconds >= 60) {
    ageLabel = `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`;
  } else {
    ageLabel = `${ageSeconds}s ago`;
  }

  return { ageSeconds, isDelayed, isOffline, isStale, ageLabel };
}