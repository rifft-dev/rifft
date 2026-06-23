import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, GitBranch } from "lucide-react";
import {
  getProjectSettings,
  getForkDrafts,
  getProjectBaseline,
  getTraceComparison,
  getTraceSnapshot,
} from "../../lib/api";
import { Badge } from "@/components/ui/badge";
import { getMastMeta } from "@/lib/mast";
import { Button } from "@/components/ui/button";
import { InteractiveTraceDetail } from "./interactive-trace-detail";
import { SetBaselineButton } from "./set-baseline-button";
import { SaveToDatasetButton } from "./save-to-dataset-button";
import { PartialFailureBanner } from "@/components/partial-failure-banner";
import { formatCurrency, formatDuration } from "@/lib/utils";

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
    messages: trace.communication_spans
      .filter((span) => span.source_agent_id === agentId || span.target_agent_id === agentId)
      .map((span) => ({
        span_id: span.span_id,
        name: span.name,
        sender: span.source_agent_id,
        receiver: span.target_agent_id,
        timestamp: span.start_time,
        payload: span.message,
        protocol: span.protocol,
      })),
    tool_calls: [],
    mast_failures: trace.mast_failures.filter((failure) => failure.agent_id === agentId),
    decision_context: {
      unavailable: true,
      reason: "agent_detail_unavailable",
    },
  };
};

// Basic sanity-check for traceId — blocks path-traversal and absurdly long inputs
// before they reach the API. Not a strict UUID check since OTel IDs vary in format.
const isValidTraceId = (id: string): boolean =>
  id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-.]+$/.test(id);

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;

  if (!isValidTraceId(traceId)) {
    notFound();
  }

  try {
    const snapshotPromise = getTraceSnapshot(traceId);
    const ancillaryResultsPromise = Promise.allSettled([
      getTraceComparison(traceId),
      getForkDrafts(traceId),
      getProjectBaseline(),
      getProjectSettings(),
    ]);
    const [snapshot, ancillaryResults] = await Promise.all([snapshotPromise, ancillaryResultsPromise]);
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

    // Track which ancillary sections failed so the warning is specific.
    const failedParts: string[] = [
      comparisonResult.status === "rejected" ? "comparison" : null,
      forkDraftsResult.status === "rejected" ? "fork drafts" : null,
      baselineResult.status === "rejected" ? "reference run" : null,
      projectSettingsResult.status === "rejected" ? "workspace settings" : null,
    ].filter((part): part is string => part !== null);

    const agentDetails = graph.nodes.map((node) => ({
      agentId: node.id,
      detail: fallbackAgentDetail(trace, graph, node.id),
    }));
    const rootCauseAgent = trace.causal_attribution.root_cause_agent_id ?? "Not inferred";
    const failingAgent = trace.causal_attribution.failing_agent_id ?? "Not inferred";
    const primaryFailureMode = trace.mast_failures[0]?.mode;
    const primaryFailure = primaryFailureMode
      ? getMastMeta(primaryFailureMode).label
      : "No failure detected";
    const comparison = comparisonResponse.comparison;
  const baseline = baselineResponse.baseline;
  const isCurrentBaseline = baseline?.trace_id === trace.trace_id;
  const comparisonData = comparison ?? null;
  const hasIncidentContext = trace.mast_failures.length > 0 || trace.status === "error";

    return (
      <div className="traces-console">
        <div className="traces-console-frame">
          <div className="tc-classbar">
            <span>RIFFT // OPERATOR CONSOLE // INCIDENT REVIEW</span>
          </div>
          <div className="tc-tickbar">
            <div className="tc-ticks">
              <span>
                <span className={`tc-dot ${trace.status === "error" ? "fail" : ""}`} />
                <span className="tc-key">RUN</span>{" "}
                <span className={trace.status === "error" ? "tc-val fail" : "tc-val"}>
                  {trace.status === "error" ? "FAILED" : trace.status.toUpperCase()}
                </span>
              </span>
              <span><span className="tc-key">TRACE</span> <span className="tc-val">{trace.trace_id}</span></span>
              <span><span className="tc-key">FRAMEWORK</span> <span className="tc-val">{trace.framework[0] ?? "UNKNOWN"}</span></span>
            </div>
            <div className="tc-ticks">
              <span><span className="tc-key">SPANS</span> <span className="tc-val">{trace.span_count}</span></span>
              <span><span className="tc-key">FAILURES</span> <span className={trace.mast_failures.length > 0 ? "tc-val fail" : "tc-val"}>{trace.mast_failures.length}</span></span>
            </div>
          </div>
          <div className="tc-section-head">
            <div className="lhs">
              <span className="num">TRACE</span>
              <span className="sep">/</span>
              <span className="title">Incident review</span>
            </div>
            <div className="rhs">
              {hasIncidentContext ? "CAUSAL ATTRIBUTION COMPLETE" : "TRACE SNAPSHOT"} · {trace.mast_failures.filter((failure) => failure.severity === "fatal").length} FATAL FAILURE
            </div>
          </div>

        <section className="tc-trace-header">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
            <Link href="/traces">
              <ArrowLeft />
              Back to incident queue
            </Link>
          </Button>
          <div className="tc-header-grid">
            <div className="space-y-4">
              <div className="space-y-2">
                <h1 className="text-4xl leading-none lg:text-5xl">
                  {trace.root_span_name ?? trace.trace_id}
                </h1>
                {trace.root_span_name ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {trace.trace_id} · ingested {new Date(trace.started_at).toISOString()} · {trace.agent_count} agents · {trace.span_count} spans
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={trace.status === "error" ? "destructive" : "secondary"}>
                  {trace.status}
                </Badge>
                <Badge variant="outline">{trace.agent_count} agents</Badge>
                {trace.framework.map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
                <Badge variant="outline">{formatCurrency(trace.total_cost_usd)}</Badge>
                <Badge variant="outline">{formatDuration(trace.duration_ms)} wall</Badge>
                {isCurrentBaseline ? <Badge variant="secondary">Reference run</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <SetBaselineButton
                  traceId={trace.trace_id}
                  isCurrentBaseline={isCurrentBaseline}
                  canUpdate={projectSettings.permissions.can_update_settings}
                />
                <SaveToDatasetButton
                  traceId={trace.trace_id}
                  projectId={projectSettings.id}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {hasIncidentContext ? (
                <>
                  <div className="tc-attr-card root">
                    <div className="tc-attr-label">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Root cause
                    </div>
                    <div className="tc-attr-value">{rootCauseAgent}</div>
                    <div className="tc-attr-sub">{primaryFailure} · fatal</div>
                  </div>
                  <div className="tc-attr-card">
                    <div className="tc-attr-label">
                      <GitBranch className="h-3.5 w-3.5" />
                      Failing agent
                    </div>
                    <div className="tc-attr-value">{failingAgent}</div>
                    <div className="tc-attr-sub">Surfaced downstream of root cause</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <PartialFailureBanner failedParts={failedParts} />
          {comparisonData ? (
            <div className="mt-6 flex flex-col gap-3 border bg-muted/20 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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
                    New: {getMastMeta(mode).label}
                  </Badge>
                ))}
                {comparisonData.failure_modes.resolved_modes.slice(0, 1).map((mode) => (
                  <Badge key={mode} variant="secondary">
                    Resolved: {getMastMeta(mode).label}
                  </Badge>
                ))}
              </div>
              {comparisonData.baseline?.trace_id ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/traces/${comparisonData.baseline.trace_id}`}>
                    Open reference run
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
        <InteractiveTraceDetail
          agentDetails={agentDetails}
          canRegenerateFailureExplanation={projectSettings.permissions.can_update_settings}
          initialForkDrafts={forkDrafts.drafts}
          graph={graph}
          timeline={timeline}
          trace={trace}
          replayHookConfigured={!!process.env.RIFFT_REPLAY_HOOK_URL}
        />
        </div>
      </div>
    );
  } catch (error) {
    // Only swallow genuine 404s — re-throw everything else so Next.js can
    // render the error boundary instead of a misleading "not found" page.
    if (error instanceof Error && error.message.includes(": 404")) {
      notFound();
    }
    throw error;
  }
}
