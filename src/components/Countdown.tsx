"use client";

import { useEffect, useState } from "react";

/**
 * Typical durations, measured on real runs, plus a safety buffer, so we usually
 * finish earlier than we promise.
 */
export const ESTIMATES = {
  findCast: 15,
  photoCheck: 12,
  characterDesign: 45,
  approve: 12,
  writeScript: 180,
  polishScript: 75,
  /** One picture on its own. */
  picture: 50,
  /** Average time per picture when a whole comic is drawing (several at once, within the rate limit). */
  picturePerComic: 15,
} as const;

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} sec`;
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, "0")} sec`;
}

/** Counts down from an estimate that started at `startedAt` (ms). */
export default function Countdown({ startedAt, seconds, className = "" }: { startedAt: number; seconds: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = seconds - (now - startedAt) / 1000;
  return (
    <span className={`tabular-nums ${className}`}>
      {left > 0 ? `about ${formatDuration(left)} left` : "almost done, finishing up…"}
    </span>
  );
}
