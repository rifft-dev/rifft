"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service here if you add one (e.g. Sentry).
    console.error("[Rifft] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. This has been logged and we&apos;ll look into it.
            </p>
            {error.digest ? (
              <p className="font-mono text-xs text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset}>
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/workspace">Go to workspace</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
