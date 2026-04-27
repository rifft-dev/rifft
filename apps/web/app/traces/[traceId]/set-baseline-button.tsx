"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { setProjectBaseline } from "../../lib/client-api";

type Props = {
  traceId: string;
  isCurrentBaseline: boolean;
  canUpdate: boolean;
};

export function SetBaselineButton({ traceId, isCurrentBaseline, canUpdate }: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  if (!canUpdate) {
    return null;
  }

  const button = (
    <Button
      variant={isCurrentBaseline ? "secondary" : "outline"}
      onClick={async () => {
        if (isCurrentBaseline) return;
        try {
          setIsSaving(true);
          await setProjectBaseline(traceId);
          toast.success("Reference run updated.");
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not update the reference run.",
          );
        } finally {
          setIsSaving(false);
        }
      }}
      disabled={isSaving || isCurrentBaseline}
    >
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
      {isCurrentBaseline ? "Current reference run" : "Use as reference run"}
    </Button>
  );

  return (
    <div className="space-y-2">
      {isCurrentBaseline ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-sm">
              This trace is your reference run. To change it, open a different trace and click "Use as reference run" there.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      <p className="max-w-md text-xs text-muted-foreground">
        {isCurrentBaseline
          ? "Newer traces will be compared against this run to show what's changed."
          : "Rifft will compare newer failures against this run to show what's new, what's resolved, and whether things are getting better or worse."}
      </p>
    </div>
  );
}
