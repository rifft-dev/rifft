"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  degraded: boolean;
  reason?: string;
};

// Poll interval in ms — every 60 seconds is enough for a status banner
const POLL_INTERVAL_MS = 60_000;

export function StatusBanner() {
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setDegraded(true);
          return;
        }
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) setDegraded(data.degraded ?? false);
      } catch {
        if (!cancelled) setDegraded(true);
      }
    };

    void check();
    const id = setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!degraded) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center text-xs text-amber-800 dark:text-amber-300"
    >
      Data may be delayed — we&apos;re working on it.{" "}
      <a
        href="https://status.rifft.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Check status
      </a>
    </div>
  );
}
