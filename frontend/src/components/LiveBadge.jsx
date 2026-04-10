/**
 * Shows a countdown to next refresh and a "LIVE" indicator.
 */
import React, { useEffect, useState } from "react";

export default function LiveBadge({ intervalSeconds = 5 }) {
  const [remaining, setRemaining] = useState(intervalSeconds);

  useEffect(() => {
    setRemaining(intervalSeconds);
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) return intervalSeconds;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [intervalSeconds]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      <span>LIVE — refreshing in {remaining}s</span>
    </div>
  );
}