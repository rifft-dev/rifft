import { notFound } from "next/navigation";
import {
  getAgentDetail,
  getForkDrafts,
  getTraceDetail,
  getTraceGraph,
  getTraceTimeline,
} from "../../lib/api";
import { Badge } from "@/components/ui/badge";
import { InteractiveTraceDetail } from "./interactive-trace-detail";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;

  try {
    const [trace, graph, timeline, forkDrafts] = await Promise.all([
      getTraceDetail(traceId),
      getTraceGraph(traceId),
      getTraceTimeline(traceId),
      getForkDrafts(traceId),
    ]);
    const agentDetails = await Promise.all(
      graph.nodes.map(async (node) => ({
        agentId: node.id,
        detail: await getAgentDetail(traceId, node.id),
      })),
    );

    return (
      <div className="space-y-6 px-0 py-0">
        <section className="border-b bg-card px-6 py-6 lg:px-8">
          <Badge variant="outline">Trace detail</Badge>
          <h1 className="mt-4 font-mono text-3xl font-semibold tracking-tight lg:text-4xl">
            {trace.trace_id}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Status {trace.status}, {trace.agent_count} agents, {trace.span_count} spans,{" "}
            {formatCurrency(trace.total_cost_usd)} total cost.
          </p>
          {trace.mast_failures.length > 0 ? (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {trace.mast_failures.length} MAST failure(s):{" "}
              {trace.mast_failures.map((failure) => failure.mode).join(", ")}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              No MAST failures detected on this trace.
            </div>
          )}
        </section>
        <InteractiveTraceDetail
          agentDetails={agentDetails}
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
