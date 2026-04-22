import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, GitBranch, TrendingDown, TrendingUp } from "lucide-react";
import {
  getAgentDetail,
  getProjectSettings,
  getForkDrafts,
  getProjectBaseline,
  getTraceComparison,
  getTraceSnapshot,
} from "../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { InteractiveTraceDetail } from "./interactive-trace-detail";
import { SetBaselineButton } from "./set-baseline-button";

const formatSignedNumber = (value: number, unit = "") => {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}${unit}`;
};

const fallbackAgentDetail = (
  trace: Awaited<ReturnType<typeof getTraceSnapshot>>["trace"],
  graph: Awaited<ReturnType<typeof getTraceSnapshot>>["graph"],
  agentId: string,
) => {
  const node = graph.nodes.find((candidate) => candidate.id === agentId);
  const framework = node?.framework ?? trace.framework[0] ?? "unknown";
  const status = node?.status ?? "unset";
  const totalCostUsd = node?.cost_usd ?? 0;
  const totalDurationMs = node?.duration_ms ?? 0;

  return {
    summary: {
      agent_id: agentId,
      framework,
      status,
      total_cost_usd: totalCostUsd,
      total_duration_ms: totalDurationMs,
    },
    messages: [],
    tool_calls: [],
    mast_failures: trace.mast_failures.filter((failure) => failure.agent_id === agentId),
    decision_context: {
      unavailable: true,
      reason: "agent_detail_unavailable",
    },
  };
};

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;

  try {
    const snapshot = await getTraceSnapshot(traceId);
    const ancillaryResults = await Promise.allSettled([
      getTraceComparison(traceId),
      getForkDrafts(traceId),
      getProjectBaseline(),
      getProjectSettings(),
    ]);
    const { trace, graph, timeline } = snapshot;
    const [comparisonResult, forkDraftsResult, baselineResult, projectSettingsResult] = ancillaryResults;
    const comparisonResponse =
      comparisonResult.status === "fulfilled" ? comparisonResult.value : { comparison: null };
    const forkDrafts =
      forkDraftsResult.status === "fulfilled" ? forkDraftsResult.value : { drafts: [] };
    const baselineResponse =
      baselineResult.status === "fulfilled" ? baselineResult.value : { baseline: null };
    const projectSettings =
      projectSettingsResult.status === "fulfilled"
        ? projectSettingsResult.value
        : {
            id: "",
            permissions: {
              can_update_settings: false,
            },
          };
    const partialFailures = ancillaryResults.filter((result) => result.status === "rejected").length;
    const agentDetails = await Promise.all(
      graph.nodes.map(async (node) => {
        try {
          return {
            agentId: node.id,
            detail: await getAgentDetail(traceId, node.id),
          };
        } catch {
          return {
            agentId: node.id,
            detail: fallbackAgentDetail(trace, graph, node.id),
          };
        }
      }),
    );
    const rootCauseAgent = trace.causal_attribution.root_cause_agent_id ?? "Not inferred";
    const failingAgent = trace.causal_attribution.failing_agent_id ?? "Not inferred";
    const primaryFailure = trace.mast_failures[0]?.mode ?? "No failure detected";
    const comparison = comparisonResponse.comparison;
  const baseline = baselineResponse.baseline;
  const isCurrentBaseline = baseline?.trace_id === trace.trace_id;
  const comparisonData = comparison ?? null;
  const hasIncidentContext = trace.mast_failures.length > 0 || trace.status === "error";

    return (
      <div className="space-y-6 px-0 py-0">
        <section className="border-b bg-card px-6 py-6 lg:px-8">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
            <Link href="/traces">
              <ArrowLeft />
              Back
            </Link>
          </Button>
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-4">
              <Badge variant="outline">Trace detail</Badge>
              <div className="space-y-3">
               <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
  {trace.root_span_name ?? trace.trace_id}
</h1>
{trace.root_span_name ? (
  <p className="font-mono text-xs text-muted-foreground">{trace.trace_id}</p>
) : null}
                <p className="max-w-3xl text-muted-foreground">
                  Follow the failure from the first bad handoff through the downstream agent that
                  finally broke. This view keeps the causal story, message payload, and replay path
                  close together.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={trace.status === "error" ? "destructive" : "secondary"}>
                  {trace.status}
                </Badge>
                <Badge variant="outline">{trace.agent_count} agents</Badge>
<Badge variant="outline">{formatCurrency(trace.total_cost_usd)}</Badge>
                {isCurrentBaseline ? <Badge variant="secondary">Baseline trace</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <SetBaselineButton
  traceId={trace.trace_id}
  isCurrentBaseline={isCurrentBaseline}
  canUpdate={projectSettings.permissions.can_update_settings}
/>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {hasIncidentContext ? (
                <>
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Root cause
                    </div>
                    <div className="mt-2 font-mono text-sm">{rootCauseAgent}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{primaryFailure}</div>
                  </div>
                  <div className="rounded-2xl border bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <GitBranch className="h-4 w-4" />
                      Failing agent
                    </div>
                    <div className="mt-2 font-mono text-sm">{failingAgent}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last known failing point in the inferred chain
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          {partialFailures > 0 ? (
            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
              Some comparison or workspace metadata could not be loaded, so Rifft is showing the trace with partial context instead of failing the whole page.
            </div>
          ) : null}
          {comparisonData ? (
            <div className="mt-6 rounded-3xl border bg-muted/20 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        comparisonData.verdict === "improved"
                          ? "secondary"
                          : comparisonData.verdict === "regressed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {comparisonData.verdict === "improved"
                        ? "Improved vs baseline"
                        : comparisonData.verdict === "regressed"
                          ? "Regressed vs baseline"
                          : comparisonData.verdict === "same"
                            ? "Same as baseline"
                            : "Changed vs baseline"}
                    </Badge>
                    <Badge variant="outline">Baseline {comparisonData.baseline?.trace_id}</Badge>
                  </div>
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    Compare this run against the trace you marked as your baseline to see whether the
                    latest change actually reduced failures.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="-ml-3 xl:ml-0">
                  <Link href={`/traces/${comparisonData.baseline?.trace_id}`}>
                    <ArrowLeft className="h-4 w-4" />
                    Open baseline
                  </Link>
                </Button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {comparisonData.deltas.failure_count <= 0 ? (
                      <TrendingDown className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-destructive" />
                    )}
                    Failure delta
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {formatSignedNumber(comparisonData.deltas.failure_count)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Fatal delta {formatSignedNumber(comparisonData.deltas.fatal_failure_count)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Duration delta</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {formatSignedNumber(Math.round(comparisonData.deltas.duration_ms), "ms")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Cost {formatCurrency(comparisonData.deltas.cost_usd)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Failure modes</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {comparisonData.failure_modes.new_modes.slice(0, 2).map((mode) => (
                      <Badge key={mode} variant="destructive">
                        New: {mode}
                      </Badge>
                    ))}
                    {comparisonData.failure_modes.resolved_modes.slice(0, 2).map((mode) => (
                      <Badge key={mode} variant="secondary">
                        Resolved: {mode}
                      </Badge>
                    ))}
                    {comparisonData.failure_modes.new_modes.length === 0 &&
                    comparisonData.failure_modes.resolved_modes.length === 0 ? (
                      <Badge variant="outline">No mode changes</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Root cause shift</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {comparisonData.root_cause.baseline ?? "Not inferred"} →{" "}
                    <span className="font-medium text-foreground">
                      {comparisonData.root_cause.current ?? "Not inferred"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {comparisonData.status_transition.baseline} → {comparisonData.status_transition.current}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border bg-muted/20 p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Comparison unavailable</Badge>
                  {baseline ? <Badge variant="outline">Baseline {baseline.trace_id}</Badge> : null}
                </div>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {!baseline
                    ? "You have not marked a baseline yet. Set a healthy or representative trace as your baseline to compare this run against it."
                    : isCurrentBaseline
                      ? "This trace is currently marked as the baseline, so there is nothing to compare it against here yet."
                      : "Rifft could not build a before/after comparison for this trace yet. Try another incident or refresh after newer trace data lands."}
                </p>
              </div>
            </div>
          )}
        </section>
        <InteractiveTraceDetail
          agentDetails={agentDetails}
          canRegenerateFailureExplanation={projectSettings.permissions.can_update_settings}
          initialForkDrafts={forkDrafts.drafts}
          graph={graph}
          timeline={timeline}
          trace={trace}
        />
      </div>
    );
  } catch {
    notFound();
  }
}
