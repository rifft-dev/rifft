"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on the trace detail page when one or more ancillary API calls failed.
 * Names the missing sections and offers a reload — most of these failures are
 * transient network issues that a refresh will resolve.
 */
export function PartialFailureBanner({ failedParts }: { failedParts: string[] }) {
  if (failedParts.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Could not load:{" "}
        <span className="font-medium text-foreground">{failedParts.join(", ")}</span>. This is
        usually a temporary issue — a refresh should restore the missing context.
      </span>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => window.location.reload()}
      >
        <RotateCw className="h-3.5 w-3.5" />
        Reload
      </Button>
    </div>
  );
}
