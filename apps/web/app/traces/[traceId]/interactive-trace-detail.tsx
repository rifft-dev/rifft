"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, GitBranch, Loader2, Play, RadioTower, ShieldAlert } from "lucide-react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { saveForkDraft as persistForkDraft } from "../../lib/client-api";
import { formatCurrency } from "@/lib/utils";
import type { AgentDetail, ForkDraft, TraceDetail, TraceGraph, TraceLiveSnapshot, TraceTimeline } from "../../lib/api-types";

type AgentRecord = {
  agentId: string;
  detail: AgentDetail;
};

type Props = {
  trace: TraceDetail;
  graph: TraceGraph;
  timeline: TraceTimeline;
  agentDetails: AgentRecord[];
  initialForkDrafts: ForkDraft[];
};

type LiveState = {
  isLive: boolean;
  lastActivityAt: string;
  isRefreshing: boolean;
  sessionExpired?: boolean;
};

type AgentNodeData = TraceGraph["nodes"][number] & { mastFailureCount: number };

const GRAPH_NODE_WIDTH = 220;
const GRAPH_NODE_HEIGHT = 132;
const GRAPH_LAYER_GAP = 260;
const GRAPH_ROW_GAP = 170;

const chartConfig = {
  duration: { label: "Duration", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const MAX_JSON_PREVIEW_CHARS = 12_000;

const formatJson = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

const formatJsonPreview = (value: unknown) => {
  const formatted = formatJson(value);
  if (formatted.length <= MAX_JSON_PREVIEW_CHARS) {
    return formatted;
  }

  return `${formatted.slice(0, MAX_JSON_PREVIEW_CHARS)}\n\n… truncated for preview`;
};

const statusVariant = (status: string) => {
  if (status === "error") return "destructive" as const;
  if (status === "ok") return "secondary" as const;
  return "outline" as const;
};

const buildLayeredLayout = (nodes: TraceGraph["nodes"], edges: TraceGraph["edges"]) => {
  const nodeIds = nodes.map((node) => node.id);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }

  for (const edge of edges) {
    incoming.get(edge.target)?.add(edge.source);
    outgoing.get(edge.source)?.add(edge.target);
  }

  const queue = nodeIds.filter((id) => (incoming.get(id)?.size ?? 0) === 0);
  const inDegree = new Map(nodeIds.map((id) => [id, incoming.get(id)?.size ?? 0]));
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    topologicalOrder.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  for (const id of nodeIds) {
    if (!topologicalOrder.includes(id)) {
      topologicalOrder.push(id);
    }
  }

  const layers = new Map<string, number>();
  for (const id of topologicalOrder) {
    const parents = [...(incoming.get(id) ?? [])];
    const layer =
      parents.length > 0 ? Math.max(...parents.map((parent) => layers.get(parent) ?? 0)) + 1 : 0;
    layers.set(id, layer);
  }

  const grouped = new Map<number, string[]>();
  for (const id of nodeIds) {
    const layer = layers.get(id) ?? 0;
    const entries = grouped.get(layer) ?? [];
    entries.push(id);
    grouped.set(layer, entries);
  }

  const sortedLayers = [...grouped.entries()].sort((left, right) => left[0] - right[0]);
  const positions = new Map<string, { x: number; y: number }>();

  for (const [layerIndex, ids] of sortedLayers) {
    ids.sort((left, right) => {
      const leftOutgoing = outgoing.get(left)?.size ?? 0;
      const rightOutgoing = outgoing.get(right)?.size ?? 0;
      if (leftOutgoing !== rightOutgoing) {
        return rightOutgoing - leftOutgoing;
      }
      return left.localeCompare(right);
    });

    const totalHeight = Math.max(0, (ids.length - 1) * GRAPH_ROW_GAP);
    const startY = Math.max(40, 160 - totalHeight / 2);

    ids.forEach((id, index) => {
      positions.set(id, {
        x: 80 + layerIndex * GRAPH_LAYER_GAP,
        y: startY + index * GRAPH_ROW_GAP,
      });
    });
  }

  return positions;
};

function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  const borderClass = data.root_cause
    ? "border-destructive"
    : data.mastFailureCount > 0
      ? "border-yellow-500"
      : data.status === "error"
        ? "border-destructive"
        : "border-border";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={`min-w-48 bg-card/95 shadow-sm ${borderClass} ${selected ? "ring-2 ring-ring" : ""}`}>
            <CardHeader className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-mono text-sm">{data.id}</CardTitle>
                <Badge variant="outline">{data.framework}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
                {data.root_cause ? <Badge variant="destructive">Root cause</Badge> : null}
                {data.mastFailureCount > 0 ? <Badge variant="outline">{data.mastFailureCount} MAST</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0 text-xs text-muted-foreground">
              <div>{formatCurrency(data.cost_usd)}</div>
              <div>{data.duration_ms}ms</div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{data.id}</p>
          <p>{data.framework}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const nodeTypes = { agent: AgentNode };

export function InteractiveTraceDetail({
  trace: initialTrace,
  graph: initialGraph,
  timeline: initialTimeline,
  agentDetails,
  initialForkDrafts,
}: Props) {
  const [trace, setTrace] = useState<TraceDetail>(initialTrace);
  const [graph, setGraph] = useState<TraceGraph>(initialGraph);
  const [timeline, setTimeline] = useState<TraceTimeline>(initialTimeline);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialGraph.nodes[0]?.id ?? null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"graph" | "timeline">("graph");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [messageOverlayOpen, setMessageOverlayOpen] = useState(false);
  const [forkPayload, setForkPayload] = useState("");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [forkDrafts, setForkDrafts] = useState<ForkDraft[]>(initialForkDrafts);
const [forkSaved, setForkSaved] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>({
    isLive: initialTrace.status === "unset",
    lastActivityAt: initialTrace.updated_at,
    isRefreshing: false,
    sessionExpired: false,
  });
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const overlayOpenedFromSheet = useRef(false);
  const previousFailureCountRef = useRef(initialTrace.mast_failures.length);

  const agentById = useMemo(() => new Map(agentDetails.map((item) => [item.agentId, item.detail])), [agentDetails]);
  const selectedAgent = selectedAgentId ? agentById.get(selectedAgentId) ?? null : null;
  const selectedMessage = selectedSpanId
    ? trace.communication_spans.find((span) => span.span_id === selectedSpanId) ?? null
    : null;
  const selectedDraft = selectedMessage
    ? forkDrafts.find((draft) => draft.span_id === selectedMessage.span_id) ?? null
    : null;
  const parsedForkPayload = useMemo(() => {
    if (!forkPayload.trim()) {
      return { valid: false as const, error: "JSON payload is required." };
    }

    try {
      return { valid: true as const, value: JSON.parse(forkPayload) as unknown };
    } catch (error) {
      return {
        valid: false as const,
        error: error instanceof Error ? error.message : "Invalid JSON",
      };
    }
  }, [forkPayload]);
  const timelineRows = [...timeline.agents].sort((left, right) => right.duration_ms - left.duration_ms);
  const selectedPathFailures = selectedMessage
    ? trace.mast_failures.filter(
        (failure) =>
          failure.agent_id === selectedMessage.source_agent_id ||
          failure.agent_id === selectedMessage.target_agent_id,
      )
    : [];
  const rootCauseAgent = trace.causal_attribution.root_cause_agent_id ?? "Not inferred";
  const failingAgent = trace.causal_attribution.failing_agent_id ?? "Not inferred";
  const hasIncidentContext = trace.mast_failures.length > 0 || trace.status === "error";
  const causalExplanation =
    trace.causal_attribution.explanation ??
    "Rifft has not inferred a causal chain for this trace yet. You can still inspect spans, messages, and failures below.";
  const liveAgeMs = Date.now() - new Date(liveState.lastActivityAt).getTime();
  const liveStatusLabel =
    liveAgeMs < 5_000 ? "updated just now" : `${Math.max(1, Math.round(liveAgeMs / 1000))}s ago`;

  useEffect(() => {
    if (!liveState.isLive) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        setLiveState((current) => ({ ...current, isRefreshing: true }));
        const response = await fetch(`/api/cloud/trace-live?traceId=${encodeURIComponent(trace.trace_id)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setLiveState((current) => ({
              ...current,
              isRefreshing: false,
              isLive: response.status === 401 ? false : current.isLive,
              sessionExpired: response.status === 401,
            }));
          }
          return;
        }

        const snapshot = (await response.json()) as TraceLiveSnapshot;
        if (cancelled) {
          return;
        }

        setTrace(snapshot.trace);
        setGraph(snapshot.graph);
        setTimeline(snapshot.timeline);
        setLiveState({
          isLive: snapshot.live.is_live,
          lastActivityAt: snapshot.live.last_activity_at,
          isRefreshing: false,
          sessionExpired: false,
        });

        if (snapshot.trace.mast_failures.length > previousFailureCountRef.current) {
          toast.warning("New anomaly detected in the live trace.");
        }
        previousFailureCountRef.current = snapshot.trace.mast_failures.length;
      } catch {
        if (!cancelled) {
          setLiveState((current) => ({ ...current, isRefreshing: false }));
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [liveState.isLive, trace.trace_id, trace.mast_failures.length]);

  const replaySpans = [...trace.communication_spans].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
  useEffect(() => {
    if (replaySpans.length > 0) {
      setReplayIndex((current) => Math.min(current, replaySpans.length - 1));
      return;
    }

    setReplayIndex(0);
  }, [replaySpans.length]);
  const replayProgressLabel =
    replaySpans.length > 0 ? `${Math.min(replayIndex + 1, replaySpans.length)} of ${replaySpans.length}` : "No replay path";
  const activeReplayIds = new Set(
    replayMode
      ? replaySpans.slice(0, replayIndex + 1).map((span) => span.span_id)
      : replaySpans.map((span) => span.span_id),
  );

  const layoutPositions = useMemo(
    () => buildLayeredLayout(graph.nodes, graph.edges),
    [graph.edges, graph.nodes],
  );

  const nodes: Node<AgentNodeData>[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "agent",
        position: layoutPositions.get(node.id) ?? { x: 80, y: 160 },
        data: {
          ...node,
          mastFailureCount: trace.mast_failures.filter((failure) => failure.agent_id === node.id).length,
        },
        width: GRAPH_NODE_WIDTH,
        height: GRAPH_NODE_HEIGHT,
      })),
    [graph.nodes, layoutPositions, trace.mast_failures],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => {
        const match = graph.communication_spans.find(
          (span) => span.source_agent_id === edge.source && span.target_agent_id === edge.target,
        );
        const selected = match?.span_id === selectedSpanId;
        const revealed = !replayMode || Boolean(match && activeReplayIds.has(match.span_id));

        return {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          label: edge.message_count > 1 ? `${edge.message_count} messages` : "message",
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: replayMode && revealed,
          style: {
            stroke: selected
              ? "hsl(var(--destructive))"
              : revealed
                ? "hsl(var(--border))"
                : "hsl(var(--muted-foreground))",
            opacity: revealed ? 1 : 0.35,
          },
          labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
          data: match,
        };
      }),
    [activeReplayIds, graph.communication_spans, graph.edges, replayMode, selectedSpanId],
  );

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSheetOpen(true);
    overlayOpenedFromSheet.current = false;
  };

  const openMessageOverlay = (spanId: string, targetAgentId?: string) => {
    setSelectedSpanId(spanId);
    if (targetAgentId) {
      setSelectedAgentId(targetAgentId);
    }
    overlayOpenedFromSheet.current = sheetOpen;
    setMessageOverlayOpen(true);
  };

  const openForkDialog = () => {
    if (!selectedMessage) return;
    setForkPayload(JSON.stringify(selectedDraft?.payload ?? selectedMessage.message ?? null, null, 2));
    setForkOpen(true);
  };

  const saveFork = async () => {
  if (!selectedMessage || !parsedForkPayload.valid) return;

  try {
    const draft = await persistForkDraft(
      trace.trace_id,
      selectedMessage.span_id,
      parsedForkPayload.value,
    );
    setForkDrafts((current) => [draft, ...current.filter((item) => item.span_id !== draft.span_id)]);
    setForkSaved(true);
    toast.success("Fork draft saved");
  } catch {
    toast.error("Fork draft must be valid JSON");
  }
};

  const stepReplay = (direction: -1 | 1) => {
    if (replaySpans.length === 0) return;

    const next = Math.max(0, Math.min(replayIndex + direction, replaySpans.length - 1));
    const span = replaySpans[next];
    setReplayIndex(next);
    setSelectedSpanId(span.span_id);
    setSelectedAgentId(span.target_agent_id);
  };

  return (
    <>
      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="space-y-6">
            <div className={`section-fade grid gap-4 ${hasIncidentContext ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
              {hasIncidentContext ? (
                <>
                  <Card className="rounded-2xl border-destructive/20 bg-gradient-to-br from-destructive/8 to-transparent">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Root cause</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="font-mono text-sm font-semibold">{rootCauseAgent}</div>
                      <Badge variant="destructive">{trace.mast_failures[0]?.mode ?? "Failure detected"}</Badge>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Failing agent</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-sm font-semibold">{failingAgent}</CardContent>
                  </Card>
                </>
              ) : null}
              <Card
                className={`rounded-2xl transition-colors ${trace.communication_spans.length > 0 ? "cursor-pointer hover:border-primary/40 hover:bg-muted/30" : ""}`}
                onClick={() => {
                  if (trace.communication_spans.length > 0) {
                    setReplayMode(true);
                    setActiveTab("graph");
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Handoff path</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-2xl font-semibold">{trace.communication_spans.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {trace.communication_spans.length > 0
                      ? "saved handoff steps · click to step through"
                      : "communication steps captured"}
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Total cost</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{formatCurrency(trace.total_cost_usd)}</CardContent>
              </Card>
            </div>

            <Card className="section-fade rounded-2xl border border-chart-1/25 bg-[radial-gradient(circle_at_left,hsl(var(--chart-1))/0.1,transparent_40%),hsl(var(--card))]">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={liveState.isLive ? "default" : "outline"}>
                      {liveState.isLive ? "Live trace" : "Snapshot"}
                    </Badge>
                   {!liveState.isLive || liveAgeMs >= 10_000 ? (
  <Badge variant="outline">Last activity {liveStatusLabel}</Badge>
) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {liveState.sessionExpired
                      ? "Your session expired while this trace was live. Refresh the page to resume live updates."
                      : liveState.isLive
                      ? "Rifft is still receiving spans for this run. The graph, timeline, and anomaly state refresh automatically while it stays active."
                      : "This trace is no longer receiving new spans. You are looking at the latest stored snapshot."}
                  </p>
                </div>
                <div className="rounded-2xl border bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <RadioTower className="h-4 w-4 text-chart-1" />
                    In-flight anomaly watch
                  </div>
                  <div className="mt-1">
                    {trace.mast_failures.length > 0
                      ? `${trace.mast_failures.length} MAST signal${trace.mast_failures.length === 1 ? "" : "s"} detected so far`
                      : "No MAST anomalies detected yet"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "graph" | "timeline")} className="section-fade space-y-4">
              <div className="flex flex-col gap-4 rounded-3xl border bg-card/70 p-4 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <TabsList>
                    <TabsTrigger value="graph">Graph</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  </TabsList>
                  <p className="text-sm text-muted-foreground">
                    Move between the causal graph and the timing view without losing the selected
                    handoff or replay position.
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {replayMode
                    ? "Step-through controls are anchored to the graph below. This does not rerun your pipeline."
                    : "Start stepping through recorded handoffs from the graph when you want to inspect the cascade."}
                </div>
              </div>

              <TabsContent value="graph" className="mt-0">
                <Card className="overflow-hidden rounded-3xl border-border/70 bg-card/85 p-0 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b px-6 py-4">
                    <div>
                      <div className="text-sm font-medium">Agent communication graph</div>
                      <div className="text-sm text-muted-foreground">
                        Follow the chain reaction from the earliest bad handoff to the visible
                        failure point.
                      </div>
                    </div>
                    {trace.mast_failures.length > 0 ? (
                      <Badge variant="destructive">{trace.mast_failures.length} failure(s) detected</Badge>
                    ) : null}
                  </div>
                  <div className="relative graph-tab-height bg-[radial-gradient(circle_at_top,hsl(var(--muted))/0.3,transparent_45%)]">
                    <div className="pointer-events-none absolute left-6 top-4 z-10 flex items-center gap-2">
                      {replayMode ? (
                        <Badge variant="outline" className="pointer-events-auto bg-background/85 backdrop-blur">
                          Step-through {replayProgressLabel}
                        </Badge>
                      ) : graph.edges.length > 0 ? (
                        <Badge variant="outline" className="pointer-events-auto bg-background/85 backdrop-blur">
                          Step-through available
                        </Badge>
                      ) : null}
                    </div>
                    {graph.edges.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                        <div className="rounded-2xl border border-dashed bg-muted/20 p-8">
                          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/40" />
                          <div className="mt-4 text-sm font-medium">No inter-agent communication captured</div>
                          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                            This trace contains{" "}
                            {graph.nodes.length === 1 ? "a single agent" : `${graph.nodes.length} agents`}{" "}
                            with no recorded handoffs between them. Check your SDK instrumentation if
                            you expected cross-agent spans.
                          </p>
                          {graph.nodes.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => openAgent(graph.nodes[0].id)}
                              className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Inspect {graph.nodes[0].id}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <ReactFlowProvider>
                        <ReactFlow
                          fitView
                          colorMode="dark"
                          nodes={nodes}
                          edges={edges}
                          nodeTypes={nodeTypes}
                          onNodeClick={(_, node) => openAgent(node.id)}
                          onEdgeClick={(_, edge) => {
                            const match = edge.data as TraceGraph["communication_spans"][number] | undefined;
                            if (match) {
                              openMessageOverlay(match.span_id, match.target_agent_id);
                            }
                          }}
                        >
                          <Background />
                          <Controls />
                          <MiniMap pannable zoomable />
                        </ReactFlow>
                      </ReactFlowProvider>
                    )}
                    {graph.edges.length > 0 ? (
                    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur">
                      {replayMode ? (
                        <>
                          <Button variant="outline" onClick={() => stepReplay(-1)}>
                            Step back
                          </Button>
                          <Button onClick={() => stepReplay(1)}>Step forward</Button>
                          <Button variant="outline" onClick={openForkDialog}>
                            Save draft here
                          </Button>
                          <Button variant="ghost" onClick={() => setReplayMode(false)}>
                            Exit step-through
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => setReplayMode(true)}>
                          <Play className="h-4 w-4" />
                          Step through handoffs
                        </Button>
                      )}
                    </div>
                    ) : null}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <Card className="timeline-tab-height rounded-3xl border-border/70 bg-card/85 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>Timeline</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Compare agent durations and jump straight into the matching detail panel.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Wall clock view</Badge>
                        <Badge variant="outline">{timeline.agents.length} lanes</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid h-[calc(100%-5rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={timeline.agents}
                          layout="vertical"
                          margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tickFormatter={(value) => `${value}ms`} />
                          <YAxis type="category" dataKey="agent_id" width={110} />
                          <RechartsTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="duration_ms"
                            radius={8}
                            onClick={(payload: { agent_id: string }) => openAgent(payload.agent_id)}
                            onMouseEnter={(payload: { agent_id: string }) => setHoveredAgentId(payload.agent_id)}
                            onMouseLeave={() => setHoveredAgentId(null)}
                          >
                            {timeline.agents.map((entry) => (
                              <Cell
                                key={entry.agent_id}
                                fill={
                                  entry.status === "error"
                                    ? "hsl(var(--destructive))"
                                    : hoveredAgentId && hoveredAgentId !== entry.agent_id
                                      ? "hsl(var(--chart-1) / 0.3)"
                                      : "hsl(var(--chart-1))"
                                }
                                style={{ cursor: "pointer", transition: "fill 120ms ease" }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                    <div className="grid gap-3">
                      <Card className="shadow-none">
                        <CardHeader>
                          <CardTitle className="text-base">Longest-running agents</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {timelineRows.map((entry) => (
                            <button
                              key={entry.agent_id}
                              type="button"
                              onClick={() => openAgent(entry.agent_id)}
                              onMouseEnter={() => setHoveredAgentId(entry.agent_id)}
                              onMouseLeave={() => setHoveredAgentId(null)}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                                hoveredAgentId === entry.agent_id ? "bg-muted/40 border-border" : ""
                              }`}
                            >
                              <div>
                                <div className="font-mono text-sm">{entry.agent_id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {entry.start_ms}ms to {entry.end_ms}ms
                                </div>
                              </div>
                              <Badge variant={statusVariant(entry.status)}>{entry.duration_ms}ms</Badge>
                            </button>
                          ))}
                        </CardContent>
                      </Card>
                      <Card className="shadow-none">
                        <CardHeader>
                          <CardTitle className="text-base">Communication events</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {timeline.communication_spans.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No communication events were captured for this trace.
                            </p>
                          ) : (
                            timeline.communication_spans.map((span) => {
                              const isRelated =
                                hoveredAgentId !== null &&
                                (span.source_agent_id === hoveredAgentId ||
                                  span.target_agent_id === hoveredAgentId);
                              return (
                              <button
                                key={span.span_id}
                                type="button"
                                onClick={() => openMessageOverlay(span.span_id, span.target_agent_id)}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                                  isRelated ? "border-chart-1/50 bg-chart-1/8" : ""
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`font-mono text-xs ${isRelated ? "text-foreground" : ""}`}>
                                    {span.source_agent_id} {"->"} {span.target_agent_id}
                                  </span>
                                  <Badge variant="outline">{span.duration_ms}ms</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {span.start_ms}ms to {span.end_ms}ms
                                </p>
                              </button>
                              );
                            })
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card className="rounded-3xl border-destructive/30 bg-gradient-to-br from-destructive/8 via-card to-card shadow-md ring-1 ring-destructive/10">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Incident summary
                  </CardTitle>
                  <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-2xl border bg-background/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Causal chain
                  </div>
                  <p className="text-sm text-muted-foreground">
                   {causalExplanation}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border bg-background/60 p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Root cause agent
                    </div>
                    <div className="mt-2 font-mono text-sm">{rootCauseAgent}</div>
                  </div>
                  <div className="rounded-2xl border bg-background/60 p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Failing agent
                    </div>
                    <div className="mt-2 font-mono text-sm">{failingAgent}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {trace.communication_spans.length > 0 ? (
            <>
            <Card className="rounded-3xl border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  Selected handoff
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedMessage ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedMessage.protocol}</Badge>
                      <Badge variant={statusVariant(selectedMessage.status)}>{selectedMessage.status}</Badge>
                      <Badge variant="outline">{selectedMessage.duration_ms}ms</Badge>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-sm font-medium">
                        {selectedMessage.source_agent_id} {"->"} {selectedMessage.target_agent_id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedMessage.start_time}
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="mb-2 text-sm font-medium">Payload preview</div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                        {formatJsonPreview(selectedMessage.message)}
                      </pre>
                    </div>
                    {selectedDraft ? (
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <div className="mb-2 text-sm font-medium">Saved fork draft</div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                          {formatJsonPreview(selectedDraft.payload)}
                        </pre>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setMessageOverlayOpen(true)}>Open full message</Button>
                      <Button variant="outline" onClick={openForkDialog}>
                        Save draft from this handoff
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select an edge in the graph or an event in the timeline to inspect the handoff.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  Failures on this path
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedPathFailures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedMessage
                      ? "No path-specific MAST failures for the current selection."
                      : "Select an edge or timeline event to see failures on that path."}
                  </p>
                ) : (
                  selectedPathFailures.map((failure) => (
                    <div key={`${failure.mode}-${failure.agent_id ?? "trace"}`} className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{failure.mode}</span>
                        <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                          {failure.severity}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{failure.explanation}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            </>
            ) : null}
          </div>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full max-w-[480px] flex-col gap-0 p-0">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="font-mono">
              {selectedAgent?.summary.agent_id ?? "Agent detail"}
            </SheetTitle>
            <SheetDescription>
              {selectedAgent
                ? `${selectedAgent.summary.framework} • ${formatCurrency(selectedAgent.summary.total_cost_usd)} • ${selectedAgent.summary.total_duration_ms}ms`
                : "Select a node or timeline bar to inspect an agent."}
            </SheetDescription>
          </SheetHeader>
          {selectedAgent ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-6 py-4">
                <Badge variant={statusVariant(selectedAgent.summary.status)}>
                  {selectedAgent.summary.status}
                </Badge>
                <Badge variant="outline">{selectedAgent.summary.framework}</Badge>
                <Badge variant="outline">
                  {formatCurrency(selectedAgent.summary.total_cost_usd)}
                </Badge>
                <Badge variant="outline">{selectedAgent.summary.total_duration_ms}ms</Badge>
                {selectedAgent.mast_failures.length > 0 ? (
                  <Badge variant={selectedAgent.mast_failures.some((f) => f.severity === "fatal") ? "destructive" : "outline"}>
                    {selectedAgent.mast_failures.length} failure{selectedAgent.mast_failures.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>
              <Tabs defaultValue="messages" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-6 mt-4 w-auto justify-start rounded-xl">
                  <TabsTrigger value="messages">
                    Messages
                    {selectedAgent.messages.length > 0 ? (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                        {selectedAgent.messages.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    Tool calls
                    {selectedAgent.tool_calls.length > 0 ? (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                        {selectedAgent.tool_calls.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="failures">
                    Failures
                    {selectedAgent.mast_failures.length > 0 ? (
                      <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] tabular-nums text-destructive">
                        {selectedAgent.mast_failures.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  {selectedAgent.decision_context ? (
                    <TabsTrigger value="context">Context</TabsTrigger>
                  ) : null}
                </TabsList>
                <ScrollArea className="flex-1">
                  <TabsContent value="messages" className="mt-0 px-6 py-4">
                    {selectedAgent.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No messages recorded for this agent.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedAgent.messages.map((message) => (
                          <button
                            key={message.span_id}
                            className="w-full rounded-lg border p-3 text-left hover:bg-muted/50"
                            onClick={() => openMessageOverlay(message.span_id, message.receiver)}
                            type="button"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs">
                                {message.sender} {"->"} {message.receiver}
                              </span>
                              <Badge variant="outline">{message.protocol}</Badge>
                            </div>
                            <pre className="mt-2 whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                              {formatJsonPreview(message.payload)}
                            </pre>
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="tools" className="mt-0 px-6 py-4">
                    {selectedAgent.tool_calls.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tool calls recorded for this agent.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedAgent.tool_calls.map((toolCall) => (
                          <div key={toolCall.span_id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{toolCall.tool_name}</span>
                              <Badge variant="outline">{toolCall.duration_ms}ms</Badge>
                            </div>
                            <pre className="mt-2 whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                              {formatJsonPreview(toolCall.input)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="failures" className="mt-0 px-6 py-4">
                    {selectedAgent.mast_failures.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No failures attached to this agent.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedAgent.mast_failures.map((failure) => (
                          <div key={failure.mode} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{failure.mode}</span>
                              <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                                {failure.severity}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{failure.explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                 {selectedAgent.decision_context ? (
                    <TabsContent value="context" className="mt-0 px-6 py-4">
                      <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                        {formatJsonPreview(selectedAgent.decision_context)}
                      </pre>
                    </TabsContent>
                  ) : null}
                </ScrollArea>
              </Tabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={forkOpen} onOpenChange={(open) => { setForkOpen(open); if (!open) setForkSaved(false); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Save fork draft</DialogTitle>
            <DialogDescription>
              Edit the latest message payload and save a draft at this handoff point.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2 text-sm">
              <div className="font-medium">JSON validation</div>
              {parsedForkPayload.valid ? (
                <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Valid JSON
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 text-destructive">
                  <CircleAlert className="h-4 w-4" />
                  Invalid JSON
                </div>
              )}
            </div>
            <Textarea
              className="min-h-80 font-mono text-xs"
              value={forkPayload}
              onChange={(event) => setForkPayload(event.target.value)}
            />
           {!parsedForkPayload.valid ? (
  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
    {parsedForkPayload.error}
  </div>
) : forkSaved ? (
  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
    Draft saved. Re-run your pipeline with this payload injected at the handoff point, then open the new trace to see whether the fix held.
  </div>
) : (
  <div className="text-sm text-muted-foreground">
    Save is enabled. Rifft will keep this draft attached to the selected handoff.
  </div>
)}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFork} disabled={!parsedForkPayload.valid}>
              Save fork draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={messageOverlayOpen} onOpenChange={setMessageOverlayOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Message detail</DialogTitle>
            <DialogDescription>
              {selectedMessage
                ? `${selectedMessage.source_agent_id} -> ${selectedMessage.target_agent_id}`
                : "Select a communication edge to inspect the full payload and context."}
            </DialogDescription>
          </DialogHeader>
          {selectedMessage ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedMessage.protocol}</Badge>
                  <Badge variant={statusVariant(selectedMessage.status)}>{selectedMessage.status}</Badge>
                  <Badge variant="outline">{selectedMessage.duration_ms}ms</Badge>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="mb-2 text-sm font-medium">Payload</div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                    {formatJsonPreview(selectedMessage.message)}
                  </pre>
                </div>
                {selectedDraft ? (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="mb-2 text-sm font-medium">Saved fork draft</div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                      {formatJsonPreview(selectedDraft.payload)}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Path context</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div>
                      <div className="font-medium text-foreground">Timestamp</div>
                      <div>{selectedMessage.start_time}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Causal chain</div>
                      <div>
                        {causalExplanation}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Quick actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMessageOverlayOpen(false);
                        setSheetOpen(true);
                      }}
                    >
                      {overlayOpenedFromSheet.current ? "Back to agent" : "Open downstream agent"}
                    </Button>
                    <Button
                      onClick={() => {
                        setMessageOverlayOpen(false);
                        openForkDialog();
                      }}
                    >
                      Save draft from this message
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
