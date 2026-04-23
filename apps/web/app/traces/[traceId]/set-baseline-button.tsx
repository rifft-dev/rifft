"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-2">
      <Button
        variant={isCurrentBaseline ? "secondary" : "outline"}
        onClick={async () => {
          try {
            setIsSaving(true);
            await setProjectBaseline(traceId);
            toast.success(isCurrentBaseline ? "Comparison run confirmed." : "Comparison run updated.");
            router.refresh();
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Could not update the comparison run.",
            );
          } finally {
            setIsSaving(false);
          }
        }}
        disabled={isSaving}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
        {isCurrentBaseline ? "Run used for comparison" : "Use as reference run"}
      </Button>
      <p className="max-w-md text-xs text-muted-foreground">
        {isCurrentBaseline
          ? "Other traces can be compared against this run."
          : "Rifft can compare other traces against this run to show whether things got better or worse."}
      </p>
    </div>
  );
}
