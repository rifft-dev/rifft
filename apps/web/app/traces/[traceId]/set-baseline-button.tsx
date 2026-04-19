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
    <Button
      variant={isCurrentBaseline ? "secondary" : "outline"}
      onClick={async () => {
        try {
          setIsSaving(true);
          await setProjectBaseline(traceId);
          toast.success(isCurrentBaseline ? "Baseline confirmed." : "Baseline updated.");
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not update the baseline trace.",
          );
        } finally {
          setIsSaving(false);
        }
      }}
      disabled={isSaving}
    >
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
      {isCurrentBaseline ? "Current baseline" : "Use as baseline"}
    </Button>
  );
}
