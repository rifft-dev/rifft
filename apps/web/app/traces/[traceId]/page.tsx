import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, GitBranch } from "lucide-react";
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
import { InteractiveTraceDetail } from "./interactive-trace-detail";
import { SetBaselineButton } from "./set-baseline-button";

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
              <div className="space-y-2">
               <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
  {trace.root_span_name ?? trace.trace_id}
</h1>
{trace.root_span_name ? (
  <p className="font-mono text-xs text-muted-foreground">{trace.trace_id}</p>
) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={trace.status === "error" ? "destructive" : "secondary"}>
                  {trace.status}
                </Badge>
                <Badge variant="outline">{trace.agent_count} agents</Badge>
                {isCurrentBaseline ? <Badge variant="secondary">Reference run</Badge> : null}
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
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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
                    ? "Improved vs reference"
                    : comparisonData.verdict === "regressed"
                      ? "Regressed vs reference"
                      : comparisonData.verdict === "same"
                        ? "Same as reference"
                        : "Changed vs reference"}
                </Badge>
                {comparisonData.failure_modes.new_modes.slice(0, 1).map((mode) => (
                  <Badge key={mode} variant="destructive">
                    New: {mode}
                  </Badge>
                ))}
                {comparisonData.failure_modes.resolved_modes.slice(0, 1).map((mode) => (
                  <Badge key={mode} variant="secondary">
                    Resolved: {mode}
                  </Badge>
                ))}
              </div>
              <Button asChild variant="ghost" size="sm" className="-ml-3 sm:ml-0">
                <Link href={`/traces/${comparisonData.baseline?.trace_id}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Open reference
                </Link>
              </Button>
            </div>
          ) : (
            !baseline || isCurrentBaseline ? (
              <div className="mt-6 rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {!baseline
                  ? "No reference run selected yet. Pick a healthy run when you want before/after comparisons."
                  : "This trace is your reference run, so newer runs will be compared against it."}
              </div>
            ) : null
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
