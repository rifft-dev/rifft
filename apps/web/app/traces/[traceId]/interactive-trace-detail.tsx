"use client";

import { useMemo, useState } from "react";
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
import { saveForkDraft as persistForkDraft } from "../../lib/api";
import type { AgentDetail, ForkDraft, TraceDetail, TraceGraph, TraceTimeline } from "../../lib/api";

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

type AgentNodeData = TraceGraph["nodes"][number] & { mastFailureCount: number };

const chartConfig = {
  duration: { label: "Duration", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

const formatJson = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

const statusVariant = (status: string) => {
  if (status === "error") return "destructive" as const;
  if (status === "ok") return "secondary" as const;
  return "outline" as const;
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
  trace,
  graph,
  timeline,
  agentDetails,
  initialForkDrafts,
}: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(graph.nodes[0]?.id ?? null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(graph.communication_spans[0]?.span_id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [messageOverlayOpen, setMessageOverlayOpen] = useState(false);
  const [forkPayload, setForkPayload] = useState("");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [forkDrafts, setForkDrafts] = useState<ForkDraft[]>(initialForkDrafts);

  const agentById = useMemo(() => new Map(agentDetails.map((item) => [item.agentId, item.detail])), [agentDetails]);
  const selectedAgent = selectedAgentId ? agentById.get(selectedAgentId) ?? null : null;
  const selectedMessage =
    trace.communication_spans.find((span) => span.span_id === selectedSpanId) ??
    trace.communication_spans[0] ??
    null;
  const selectedDraft = selectedMessage
    ? forkDrafts.find((draft) => draft.span_id === selectedMessage.span_id) ?? null
    : null;
  const timelineRows = [...timeline.agents].sort((left, right) => right.duration_ms - left.duration_ms);

  const replaySpans = [...trace.communication_spans].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
  const activeReplayIds = new Set(
    replayMode
      ? replaySpans.slice(0, replayIndex + 1).map((span) => span.span_id)
      : replaySpans.map((span) => span.span_id),
  );

  const nodes: Node<AgentNodeData>[] = graph.nodes.map((node, index) => ({
    id: node.id,
    type: "agent",
    position: { x: 100 + index * 280, y: index % 2 === 0 ? 120 : 260 },
    data: {
      ...node,
      mastFailureCount: trace.mast_failures.filter((failure) => failure.agent_id === node.id).length,
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => {
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
  });

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSheetOpen(true);
  };

  const openMessageOverlay = (spanId: string, targetAgentId?: string) => {
    setSelectedSpanId(spanId);
    if (targetAgentId) {
      setSelectedAgentId(targetAgentId);
    }
    setMessageOverlayOpen(true);
  };

  const openForkDialog = () => {
    if (!selectedMessage) return;
    setForkPayload(JSON.stringify(selectedDraft?.payload ?? selectedMessage.message ?? null, null, 2));
    setForkOpen(true);
  };

  const saveFork = async () => {
    if (!selectedMessage) return;

    try {
      const payload = JSON.parse(forkPayload);
      const draft = await persistForkDraft(trace.trace_id, selectedMessage.span_id, payload);
      setForkDrafts((current) => [draft, ...current.filter((item) => item.span_id !== draft.span_id)]);
      setForkOpen(false);
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
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Agents</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{trace.agent_count}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Spans</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{trace.span_count}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Cost</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatCurrency(trace.total_cost_usd)}</CardContent>
          </Card>
        </div>

        <Tabs defaultValue="graph" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="graph">Graph</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {replayMode ? (
                <>
                  <Button variant="outline" onClick={() => stepReplay(-1)}>
                    Step back
                  </Button>
                  <Button onClick={() => stepReplay(1)}>Step forward</Button>
                  <Button variant="outline" onClick={openForkDialog}>
                    Fork here
                  </Button>
                  <Button variant="ghost" onClick={() => setReplayMode(false)}>
                    Exit replay
                  </Button>
                </>
              ) : (
                <Button onClick={() => setReplayMode(true)}>Replay</Button>
              )}
            </div>
          </div>

          <TabsContent value="graph" className="mt-0">
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b px-6 py-3">
                <div>
                  <div className="text-sm font-medium">Agent communication graph</div>
                  <div className="text-sm text-muted-foreground">
                    React Flow graph with selectable nodes and edges.
                  </div>
                </div>
                {trace.mast_failures.length > 0 ? (
                  <Badge variant="destructive">{trace.mast_failures.length} failure(s) detected</Badge>
                ) : null}
              </div>
              <div className="graph-tab-height">
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
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <Card className="timeline-tab-height">
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
                      >
                        {timeline.agents.map((entry) => (
                          <Cell
                            key={entry.agent_id}
                            fill={
                              entry.status === "error"
                                ? "hsl(var(--destructive))"
                                : "hsl(var(--chart-1))"
                            }
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
                          className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
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
                        timeline.communication_spans.map((span) => (
                          <button
                            key={span.span_id}
                            type="button"
                            onClick={() => openMessageOverlay(span.span_id, span.target_agent_id)}
                            className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs">
                                {span.source_agent_id} {"->"} {span.target_agent_id}
                              </span>
                              <Badge variant="outline">{span.duration_ms}ms</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {span.start_ms}ms to {span.end_ms}ms
                            </p>
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {selectedMessage ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Message payload panel</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedMessage.source_agent_id} {"->"} {selectedMessage.target_agent_id}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{selectedMessage.protocol}</Badge>
                <Badge variant={statusVariant(selectedMessage.status)}>{selectedMessage.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="mb-2 text-sm font-medium">Payload</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                    {formatJson(selectedMessage.message)}
                  </pre>
                </div>
                {selectedDraft ? (
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-2 text-sm font-medium">Saved fork draft</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                      {formatJson(selectedDraft.payload)}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Causal chain</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {trace.causal_attribution.explanation ??
                      "No backend causal attribution is available for this trace yet."}
                  </CardContent>
                </Card>
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Failures on this path</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {trace.mast_failures
                      .filter(
                        (failure) =>
                          failure.agent_id === selectedMessage.source_agent_id ||
                          failure.agent_id === selectedMessage.target_agent_id,
                      )
                      .map((failure) => (
                        <div key={`${failure.mode}-${failure.agent_id ?? "trace"}`} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span>{failure.mode}</span>
                            <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                              {failure.severity}
                            </Badge>
                          </div>
                          <p className="mt-2 text-muted-foreground">{failure.explanation}</p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
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
            <ScrollArea className="mt-6 h-[calc(100vh-8rem)] pr-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(selectedAgent.summary.status)}>
                      {selectedAgent.summary.status}
                    </Badge>
                    <Badge variant="outline">{selectedAgent.summary.framework}</Badge>
                    <Badge variant="outline">
                      {formatCurrency(selectedAgent.summary.total_cost_usd)}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Messages</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                          {formatJson(message.payload)}
                        </pre>
                      </button>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tool calls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedAgent.tool_calls.map((toolCall) => (
                      <div key={toolCall.span_id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span>{toolCall.tool_name}</span>
                          <Badge variant="outline">{toolCall.duration_ms}ms</Badge>
                        </div>
                        <pre className="mt-2 whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                          {formatJson(toolCall.input)}
                        </pre>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">MAST failures</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedAgent.mast_failures.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No failures attached to this agent.</p>
                    ) : (
                      selectedAgent.mast_failures.map((failure) => (
                        <div key={failure.mode} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span>{failure.mode}</span>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Decision context</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedAgent.decision_context ? (
                      <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                        {formatJson(selectedAgent.decision_context)}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No decision context captured yet for this agent.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={forkOpen} onOpenChange={setForkOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fork and resubmit</DialogTitle>
            <DialogDescription>
              Edit the latest message payload and stage it for replay.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-80 font-mono text-xs"
            value={forkPayload}
            onChange={(event) => setForkPayload(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFork}>Save fork draft</Button>
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
                    {formatJson(selectedMessage.message)}
                  </pre>
                </div>
                {selectedDraft ? (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="mb-2 text-sm font-medium">Saved fork draft</div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                      {formatJson(selectedDraft.payload)}
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
                        {trace.causal_attribution.explanation ??
                          "No backend causal attribution is available for this trace yet."}
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
                      Open downstream agent
                    </Button>
                    <Button
                      onClick={() => {
                        setMessageOverlayOpen(false);
                        openForkDialog();
                      }}
                    >
                      Fork this message
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
