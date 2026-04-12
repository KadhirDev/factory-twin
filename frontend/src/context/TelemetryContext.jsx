/**
 * TelemetryContext
 *
 * Single shared polling layer for per-machine telemetry.
 * Replaces N individual polling calls (one per machine card) with one
 * central store that all consumers subscribe to.
 *
 * Usage:
 *   const { getTelemetry, getLatest } = useTelemetryCache();
 *
 * The context polls each known machine every POLL_MS milliseconds.
 * New machines discovered via the machines API are added automatically.
 */

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getMachines, getTelemetryHistory } from "../api/client";

const POLL_MS        = 5000;   // unified interval — was 6000 per card
const HISTORY_LIMIT  = 30;     // samples per machine (enough for sparklines + latest)

const TelemetryContext = createContext(null);

export function TelemetryProvider({ children }) {
  // cache[machine_id] = TelemetryResponse[]  (newest-first)
  const [cache,    setCache]    = useState({});
  const [machineIds, setMachineIds] = useState([]);
  const mountedRef = useRef(true);

  // ── Discover machines ───────────────────────────────────────────────────
  useEffect(() => {
    let timer;
    const fetchMachines = async () => {
      try {
        const { data } = await getMachines();
        if (!mountedRef.current) return;
        const ids = (data || []).map((m) => m.machine_id).filter(Boolean);
        setMachineIds((prev) => {
          // Only update state if the set actually changed
          const prevSet = new Set(prev);
          const nextSet = new Set(ids);
          const changed =
            ids.some((id) => !prevSet.has(id)) ||
            prev.some((id) => !nextSet.has(id));
          return changed ? ids : prev;
        });
      } catch {
        // silent — machines endpoint may be temporarily unavailable
      }
      timer = setTimeout(fetchMachines, 15_000); // re-check for new machines every 15s
    };
    fetchMachines();
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []);

  // ── Poll telemetry for each known machine ───────────────────────────────
  useEffect(() => {
    if (!machineIds.length) return;
    mountedRef.current = true;

    const fetchAll = async () => {
      const results = await Promise.allSettled(
        machineIds.map((id) =>
          getTelemetryHistory(id, HISTORY_LIMIT).then((r) => ({
            id,
            data: r.data || [],
          }))
        )
      );

      if (!mountedRef.current) return;

      const updates = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          updates[r.value.id] = r.value.data;
        }
      });

      setCache((prev) => ({ ...prev, ...updates }));
    };

    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(interval);
  }, [machineIds]);

  // ── Accessors ────────────────────────────────────────────────────────────
  const getTelemetry = useCallback(
    (machineId) => cache[machineId] || [],
    [cache]
  );

  const getLatest = useCallback(
    (machineId) => (cache[machineId] || [])[0] ?? null,
    [cache]
  );

  return (
    <TelemetryContext.Provider value={{ getTelemetry, getLatest, cache }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetryCache() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    // Graceful fallback if used outside provider — returns empty data
    return {
      getTelemetry: () => [],
      getLatest:    () => null,
      cache:        {},
    };
  }
  return ctx;
}