"use client";

import { useEffect, useState } from "react";
import { statusPageHref } from "@/lib/status";

type HealthResponse = {
  degraded: boolean;
  reason?: string;
};

// Poll interval in ms — every 60 seconds is enough for a status banner
const POLL_INTERVAL_MS = 60_000;
const CONFIRM_DEGRADED_MS = 5_000;

export function StatusBanner() {
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let consecutiveDegradedChecks = 0;
    let confirmTimeout: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      let nextDegraded = false;

      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) {
          nextDegraded = true;
        } else {
          const data = (await res.json()) as HealthResponse;
          nextDegraded = data.degraded ?? false;
        }
      } catch {
        nextDegraded = true;
      }

      consecutiveDegradedChecks = nextDegraded ? consecutiveDegradedChecks + 1 : 0;

      if (!cancelled) {
        setDegraded(consecutiveDegradedChecks >= 2);
      }

      if (nextDegraded && consecutiveDegradedChecks === 1) {
        if (confirmTimeout) {
          clearTimeout(confirmTimeout);
        }
        confirmTimeout = setTimeout(() => {
          void check();
        }, CONFIRM_DEGRADED_MS);
      }
    };

    void check();
    const id = setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (confirmTimeout) {
        clearTimeout(confirmTimeout);
      }
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
        href={statusPageHref}
        target={statusPageHref.startsWith("http") ? "_blank" : undefined}
        rel={statusPageHref.startsWith("http") ? "noopener noreferrer" : undefined}
        className="underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Check status
      </a>
    </div>
  );
}
