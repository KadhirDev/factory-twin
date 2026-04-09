import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Generic polling hook.
 * Automatically starts, stops on unmount, and exposes manual refresh.
 *
 * @param {Function} fetchFn   - async function that returns data
 * @param {number}   interval  - poll interval in milliseconds
 * @param {Array}    deps      - re-subscribe when these change (like useEffect deps)
 */
export function usePolling(fetchFn, interval = 5000, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [lastAt,  setLastAt]  = useState(null);

  const timerRef    = useRef(null);
  const mountedRef  = useRef(true);

  const execute = useCallback(async () => {
    try {
      const result = await fetchFn();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      setLastAt(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || "Fetch failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    execute();
    timerRef.current = setInterval(execute, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
    };
  }, [execute, interval]);

  return { data, loading, error, lastAt, refresh: execute };
}