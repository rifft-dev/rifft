"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TraceFailureExplanation } from "../../lib/api-types";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; explanation: TraceFailureExplanation };

const getErrorMessage = (error?: string) => {
  switch (error) {
    case "failure_explanations_require_paid_plan":
      return "Failure explanations are available on Cloud Pro and Scale.";
    case "failure_explanations_not_configured":
      return "Failure explanations are not configured on the server yet.";
    case "failure_explanation_unavailable":
      return "Rifft could not generate an explanation for this trace right now.";
    case "no_fatal_failure":
      return "This trace does not have a fatal failure to explain.";
    default:
      return "Rifft could not load the failure explanation.";
  }
};

export function FailureExplanationCard({
  traceId,
  canRegenerate,
  hasFatalFailure,
}: {
  traceId: string;
  canRegenerate: boolean;
  hasFatalFailure: boolean;
}) {
  const [state, setState] = useState<LoadState>(hasFatalFailure ? { kind: "loading" } : { kind: "hidden" });
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (!hasFatalFailure) {
      setState({ kind: "hidden" });
      return;
    }

    let cancelled = false;
    const load = async () => {
      setState({ kind: "loading" });
      const response = await fetch(`/api/traces/${traceId}/failure-explanation`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        explanation?: TraceFailureExplanation | null;
        error?: string;
      };

      if (cancelled) {
        return;
      }

      if (response.status === 403 && data.error === "failure_explanations_require_paid_plan") {
        setState({ kind: "hidden" });
        return;
      }

      if (!response.ok) {
        setState({ kind: "error", message: getErrorMessage(data.error) });
        return;
      }

      if (!data.explanation) {
        setState({ kind: "hidden" });
        return;
      }

      setState({ kind: "ready", explanation: data.explanation });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [hasFatalFailure, traceId]);

  const regenerate = async () => {
    try {
      setIsRegenerating(true);
      const response = await fetch(`/api/traces/${traceId}/failure-explanation`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        explanation?: TraceFailureExplanation | null;
        error?: string;
      };

      if (!response.ok || !data.explanation) {
        toast.error(getErrorMessage(data.error));
        return;
      }

      setState({ kind: "ready", explanation: data.explanation });
      toast.success("Failure explanation regenerated.");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (state.kind === "hidden") {
    return null;
  }

  return (
    <Card className="rounded-3xl border-chart-1/30 bg-gradient-to-br from-chart-1/8 via-card to-card shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-chart-1" />
            Failure explanation
          </CardTitle>
          {canRegenerate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRegenerating || state.kind === "loading"}
              onClick={() => void regenerate()}
            >
              {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Regenerate
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === "loading" ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-background/60 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating a trace-specific explanation from the failure evidence…
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-muted-foreground">
            {state.message}
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Claude generated</Badge>
              <Badge variant="outline">{state.explanation.confidence} confidence</Badge>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                What happened
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{state.explanation.summary}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Evidence
              </div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {state.explanation.evidence.map((item) => (
                  <li key={item} className="list-disc pl-1 ml-4">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                What to change next
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{state.explanation.recommended_fix}</p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
