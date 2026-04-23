/**
 * useStableInsights
 *
 * Stabilizes an AI insight list to prevent rapid visual reordering
 * on every polling cycle.
 *
 * A new "committed" order is only adopted when a meaningful change occurs:
 *   - A new critical or warning insight appears
 *   - An existing critical/warning insight disappears
 *   - Total insight count changes by ≥ 2
 *   - The stable interval has elapsed (default 8 seconds)
 *
 * In a stable, normal-state system this means the list stays visually
 * static even as minor score fluctuations arrive every 3 seconds.
 * Urgent new signals still surface immediately.
 */

import { useRef, useState, useEffect } from "react";

export function useStableInsights(insights, stableIntervalMs = 8000) {
  const [committed,     setCommitted]     = useState(() => insights ?? []);
  const lastCommitTime = useRef(Date.now());
  const prevInsights   = useRef(insights ?? []);

  useEffect(() => {
    const next = insights ?? [];
    const prev = prevInsights.current ?? [];
    const now  = Date.now();

    // Build key sets for critical/warning insights only
    const prevUrgentKeys = new Set(
      prev
        .filter((i) => i.type === "critical" || i.type === "warning")
        .map((i) => i.text)
    );
    const nextUrgentKeys = new Set(
      next
        .filter((i) => i.type === "critical" || i.type === "warning")
        .map((i) => i.text)
    );

    const hasNewUrgent    = [...nextUrgentKeys].some((k) => !prevUrgentKeys.has(k));
    const hasLostUrgent   = [...prevUrgentKeys].some((k) => !nextUrgentKeys.has(k));
    const significantDiff = Math.abs(next.length - prev.length) >= 2;
    const intervalElapsed = now - lastCommitTime.current >= stableIntervalMs;

    if (hasNewUrgent || hasLostUrgent || significantDiff || intervalElapsed) {
      setCommitted(next);
      lastCommitTime.current = now;
    }

    prevInsights.current = next;
  }, [insights, stableIntervalMs]);

  return committed;
}