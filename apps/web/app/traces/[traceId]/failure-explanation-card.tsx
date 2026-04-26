"use client";

import { useEffect, useState } from "react";
import { Bot, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TraceFailureExplanation } from "../../lib/api-types";

type LoadState =
  | { kind: "loading" }
  | { kind: "fallback"; reason: "paid_plan_required" | "unavailable" }
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

const getFixKit = (mode?: string | null) => {
  if (mode === "unverified_information_propagation") {
    return {
      validationRule:
        "Reject or quarantine claims when their supporting sources are low confidence or missing validation.",
      promptSnippet:
        "Before finalizing, check every claim against source confidence. Do not state a claim as verified unless the evidence supports that level of certainty.",
      codeSnippet: `if (claim.sources.every((source) => source.confidence !== "high")) {
  removedClaims.push(claim.text);
  continue;
}`,
      verification:
        "Rerun the workflow and confirm the writer no longer receives unsupported claims, and output validation passes.",
    };
  }

  if (mode === "missing_output_validation") {
    return {
      validationRule:
        "Require a validation step before any final answer, handoff, or published output is accepted.",
      promptSnippet:
        "Before returning the final output, validate it against the task requirements and reject incomplete or unsupported results.",
      codeSnippet: `const validation = validateOutput(draft);
if (!validation.passed) {
  throw new Error(validation.reason);
}`,
      verification:
        "Rerun the workflow and confirm a validation span appears after the final agent output.",
    };
  }

  return {
    validationRule:
      "Add an explicit guardrail at the failing step and block unsafe or incomplete outputs before they move downstream.",
    promptSnippet:
      "Before continuing, check whether the output satisfies the task requirements. If it does not, stop and return the reason.",
    codeSnippet: `if (!isValid(nextPayload)) {
  throw new Error("Payload failed validation before the next agent.");
}`,
    verification:
      "Rerun the workflow and confirm the failure mode disappears or moves to an earlier, safer validation point.",
  };
};

const CopyButton = ({ value, label = "Copy" }: { value: string; label?: string }) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="h-8 px-2"
    onClick={() => {
      void navigator.clipboard.writeText(value);
      toast.success("Copied.");
    }}
  >
    <Copy className="h-3.5 w-3.5" />
    {label}
  </Button>
);

const FixExamples = ({ fixKit }: { fixKit: ReturnType<typeof getFixKit> }) => (
  <details className="rounded-2xl border bg-background/60 p-4">
    <summary className="cursor-pointer text-sm font-medium">Apply this in your app</summary>
    <p className="mt-2 text-sm text-muted-foreground">
      Use these as starting points for the guardrail, prompt, or code change that makes this replay pass in production.
    </p>
    <div className="mt-4 space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Guardrail
          </div>
          <CopyButton value={fixKit.validationRule} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{fixKit.validationRule}</p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Agent instruction
          </div>
          <CopyButton value={fixKit.promptSnippet} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{fixKit.promptSnippet}</p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Code pattern
          </div>
          <CopyButton value={fixKit.codeSnippet} />
        </div>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          {fixKit.codeSnippet}
        </pre>
      </div>
    </div>
  </details>
);

export function FailureExplanationCard({
  traceId,
  canRegenerate,
  hasFatalFailure,
  primaryFailure,
  rootCauseAgent,
  failingAgent,
  causalChain,
}: {
  traceId: string;
  canRegenerate: boolean;
  hasFatalFailure: boolean;
  primaryFailure?: {
    mode: string;
    agent_id: string | null;
    explanation: string;
  } | null;
  rootCauseAgent?: string | null;
  failingAgent?: string | null;
  causalChain?: string[];
}) {
  const [state, setState] = useState<LoadState>(hasFatalFailure ? { kind: "loading" } : { kind: "hidden" });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const fixKit = getFixKit(primaryFailure?.mode);

  useEffect(() => {
    if (!hasFatalFailure) {
      setState({ kind: "hidden" });
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
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
          setState({ kind: "fallback", reason: "paid_plan_required" });
          return;
        }

        if (!response.ok) {
          if (data.error === "failure_explanation_unavailable") {
            setState({ kind: "fallback", reason: "unavailable" });
            return;
          }

          setState({ kind: "error", message: getErrorMessage(data.error) });
          return;
        }

        if (!data.explanation) {
          setState({ kind: "hidden" });
          return;
        }

        setState({ kind: "ready", explanation: data.explanation });
      } catch {
        if (!cancelled) {
          setState({ kind: "error", message: getErrorMessage() });
        }
      }
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
    } catch {
      toast.error(getErrorMessage());
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
            {state.kind === "fallback" ? "What Rifft found" : "What to look at first"}
          </CardTitle>
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

        {state.kind === "fallback" ? (
          <>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Start here
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {primaryFailure
                  ? `${primaryFailure.mode} was detected${primaryFailure.agent_id ? ` around ${primaryFailure.agent_id}` : ""}.`
                  : "Rifft detected a fatal failure in this trace."}{" "}
                Inspect the highlighted message to see what was sent between agents.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                What to change
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{fixKit.validationRule}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  How to verify
                </div>
                <CopyButton value={fixKit.verification} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{fixKit.verification}</p>
            </div>
            <details className="rounded-2xl border bg-background/60 p-4">
              <summary className="cursor-pointer text-sm font-medium">Show path</summary>
              <div className="mt-3 font-mono text-sm text-muted-foreground">
                {causalChain && causalChain.length > 0
                  ? causalChain.join(" -> ")
                  : `${rootCauseAgent ?? "Unknown"} -> ${failingAgent ?? "Unknown"}`}
              </div>
            </details>
            {state.reason === "paid_plan_required" ? (
              <p className="text-xs text-muted-foreground">
                Trace-specific natural-language explanations are available on Pro and Scale.
              </p>
            ) : null}
            <FixExamples fixKit={fixKit} />
          </>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Start here
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{state.explanation.summary}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                What to change
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{state.explanation.recommended_fix}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  How to verify
                </div>
                <CopyButton value={fixKit.verification} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{fixKit.verification}</p>
            </div>

            <details className="rounded-2xl border bg-background/60 p-4">
              <summary className="cursor-pointer text-sm font-medium">Show evidence</summary>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {state.explanation.evidence.map((item) => (
                  <li key={item} className="ml-4 list-disc pl-1">
                    {item}
                  </li>
                ))}
              </ul>
              {state.explanation.key_stats && state.explanation.key_stats.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {state.explanation.key_stats.map((stat) => (
                    <div key={stat.label} className="rounded-xl border bg-muted/30 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{stat.label}: </span>
                      <span className="font-mono">{stat.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </details>

            <FixExamples fixKit={fixKit} />
            {canRegenerate ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                disabled={isRegenerating}
                onClick={() => void regenerate()}
              >
                {isRegenerating ? "Regenerating…" : "Explanation looks wrong? Regenerate"}
              </button>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
