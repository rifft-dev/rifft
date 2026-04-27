"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, GitBranch, Loader2, Play, ShieldAlert } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { replayFromSpan, saveForkDraft as persistForkDraft } from "../../lib/client-api";
import { formatCurrency } from "@/lib/utils";
import type { AgentDetail, AgentFailureDiffResult, ForkDraft, TraceDetail, TraceGraph, TraceLiveSnapshot, TraceTimeline } from "../../lib/api-types";
import { FailureExplanationCard } from "./failure-explanation-card";

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
  canRegenerateFailureExplanation: boolean;
  replayHookConfigured: boolean;
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

const buildSuggestedReplayPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const original = payload as Record<string, unknown>;
  const unsupportedClaim =
    typeof original.unsupported_claim === "string"
      ? original.unsupported_claim
      : typeof original.unsupportedClaim === "string"
        ? original.unsupportedClaim
        : null;

  if (!unsupportedClaim?.trim()) {
    return null;
  }

  const suggested: Record<string, unknown> = { ...original };
  const existingRemovedClaims = Array.isArray(suggested.removed_claims)
    ? suggested.removed_claims.filter((claim): claim is string => typeof claim === "string")
    : Array.isArray(suggested.removedClaims)
      ? suggested.removedClaims.filter((claim): claim is string => typeof claim === "string")
    : [];
  const nextRemovedClaims = existingRemovedClaims.includes(unsupportedClaim)
    ? existingRemovedClaims
    : [...existingRemovedClaims, unsupportedClaim];

  delete suggested.unsupported_claim;
  delete suggested.unsupportedClaim;
  delete suggested.removedClaims;
  suggested.removed_claims = nextRemovedClaims;

  if (Array.isArray(suggested.claims)) {
    suggested.claims = suggested.claims.filter((claim) => claim !== unsupportedClaim);
  }

  return suggested;
};

const getPayloadHints = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [] as string[];
  }

  const message = payload as Record<string, unknown>;
  const hints: string[] = [];
  const unsupportedClaim =
    typeof message.unsupported_claim === "string"
      ? message.unsupported_claim
      : typeof message.unsupportedClaim === "string"
        ? message.unsupportedClaim
        : null;

  if (unsupportedClaim) {
    hints.push(`This handoff still says "${unsupportedClaim}".`);
  }

  const removedClaims = Array.isArray(message.removed_claims)
    ? message.removed_claims.filter((item): item is string => typeof item === "string")
    : Array.isArray(message.removedClaims)
      ? message.removedClaims.filter((item): item is string => typeof item === "string")
      : [];

  if (removedClaims.length > 0) {
    hints.push(
      removedClaims.length === 1
        ? "The message already marks 1 claim as removed."
        : `The message already marks ${removedClaims.length} claims as removed.`,
    );
  }

  const lowConfidenceSources = Array.isArray(message.sources)
    ? message.sources.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const confidence = (item as Record<string, unknown>).confidence;
        return confidence === "low" || confidence === "medium";
      }).length
    : 0;

  if (lowConfidenceSources > 0) {
    hints.push(
      lowConfidenceSources === 1
        ? "1 supporting source is not high confidence."
        : `${lowConfidenceSources} supporting sources are not high confidence.`,
    );
  }

  if (Array.isArray(message.claims)) {
    hints.push(
      message.claims.length === 1
        ? "The handoff carries 1 explicit claim."
        : `The handoff carries ${message.claims.length} explicit claims.`,
    );
  }

  return hints.slice(0, 3);
};

const buildFallbackAgentDetail = (
  trace: TraceDetail,
  graph: TraceGraph,
  agentId: string,
): AgentDetail => {
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
            <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-background !bg-muted-foreground" />
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
            <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-background !bg-muted-foreground" />
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
  canRegenerateFailureExplanation,
  replayHookConfigured,
}: Props) {
  const [trace, setTrace] = useState<TraceDetail>(initialTrace);
  const [graph, setGraph] = useState<TraceGraph>(initialGraph);
  const [timeline, setTimeline] = useState<TraceTimeline>(initialTimeline);
  const [agentRecords, setAgentRecords] = useState<AgentRecord[]>(agentDetails);
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
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<{
    runId: string;
    status: "passed" | "failed";
    headline?: string;
    error?: string;
    source_trace_id?: string | null;
  } | null>(null);
  const [forkOriginalPayload, setForkOriginalPayload] = useState("");
  const [tokenLimitInput, setTokenLimitInput] = useState("");
  const [modelOverrideInput, setModelOverrideInput] = useState("");
  const [liveState, setLiveState] = useState<LiveState>({
    isLive: initialTrace.status === "unset",
    lastActivityAt: initialTrace.updated_at,
    isRefreshing: false,
    sessionExpired: false,
  });
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [agentDiffByAgent, setAgentDiffByAgent] = useState<Map<string, AgentFailureDiffResult>>(new Map());
  const overlayOpenedFromSheet = useRef(false);
  const overlaySourceAgentId = useRef<string | null>(null);
  const previousFailureCountRef = useRef(initialTrace.mast_failures.length);

  const agentById = useMemo(() => new Map(agentRecords.map((item) => [item.agentId, item.detail])), [agentRecords]);
  const replaySpans = [...trace.communication_spans].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
  const selectedAgent = selectedAgentId ? agentById.get(selectedAgentId) ?? null : null;
  const selectedMessage = selectedSpanId
    ? trace.communication_spans.find((span) => span.span_id === selectedSpanId) ?? null
    : null;
  const focusMessage = selectedMessage ?? replaySpans[0] ?? null;
  const selectedDraft = selectedMessage
    ? forkDrafts.find((draft) => draft.span_id === selectedMessage.span_id) ?? null
    : null;
  const focusDraft = focusMessage
    ? forkDrafts.find((draft) => draft.span_id === focusMessage.span_id) ?? null
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
  const suggestedForkPayload = useMemo(() => {
    if (!parsedForkPayload.valid) {
      return null;
    }

    const suggested = buildSuggestedReplayPayload(parsedForkPayload.value);
    if (!suggested) {
      return null;
    }

    if (JSON.stringify(suggested) === JSON.stringify(parsedForkPayload.value)) {
      return null;
    }

    return {
      formatted: JSON.stringify(suggested, null, 2),
    };
  }, [parsedForkPayload]);
  const timelineRows = [...timeline.agents].sort((left, right) => right.duration_ms - left.duration_ms);
  const selectedPathFailures = focusMessage
    ? trace.mast_failures.filter(
        (failure) =>
          failure.agent_id === focusMessage.source_agent_id ||
          failure.agent_id === focusMessage.target_agent_id,
      )
    : [];
  const focusPayloadHints = getPayloadHints(focusDraft?.payload ?? focusMessage?.message ?? null);
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

  useEffect(() => {
    if (replaySpans.length > 0) {
      setReplayIndex((current) => Math.min(current, replaySpans.length - 1));
      return;
    }

    setReplayIndex(0);
  }, [replaySpans.length]);

  useEffect(() => {
    setAgentRecords((current) => {
      const currentById = new Map(current.map((item) => [item.agentId, item.detail]));
      return graph.nodes.map((node) => {
        const existing = currentById.get(node.id);
        if (!existing) {
          return {
            agentId: node.id,
            detail: buildFallbackAgentDetail(trace, graph, node.id),
          };
        }

        return {
          agentId: node.id,
          detail: {
            ...existing,
            summary: {
              ...existing.summary,
              agent_id: node.id,
              framework: node.framework,
              status: node.status,
              total_cost_usd: node.cost_usd,
              total_duration_ms: node.duration_ms,
            },
            mast_failures: trace.mast_failures.filter((failure) => failure.agent_id === node.id),
          },
        };
      });
    });
  }, [graph, trace]);

  // Load agent failure diff data once on mount. Stored as a Map keyed by agent_id
  // so the agent detail sheet can look it up instantly when opened.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `/api/projects/${trace.project_id}/agent-failure-diff`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { agents?: AgentFailureDiffResult[] };
        if (!data.agents) return;
        setAgentDiffByAgent(new Map(data.agents.map((a) => [a.agent_id, a])));
      } catch {
        // non-critical — agent history tab simply won't appear
      }
    };
    void load();
  }, [trace.project_id]);
  const replayProgressLabel =
    replaySpans.length > 0 ? `${Math.min(replayIndex + 1, replaySpans.length)} of ${replaySpans.length}` : "No replay path";
  const canStepReplayBack = replayMode && replayIndex > 0;
  const canStepReplayForward = replayMode && replayIndex < replaySpans.length - 1;
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
    overlaySourceAgentId.current = null;
  };

  const openMessageOverlay = (spanId: string, targetAgentId?: string) => {
    setSelectedSpanId(spanId);
    overlaySourceAgentId.current = sheetOpen ? selectedAgentId : null;
    if (targetAgentId) {
      setSelectedAgentId(targetAgentId);
    }
    overlayOpenedFromSheet.current = sheetOpen;
    setMessageOverlayOpen(true);
  };

  // Detect numeric attributes from a parsed payload that the user can override.
  const detectPayloadParams = (payload: unknown): { estimatedTokens: number | null; model: string | null } => {
    if (!payload || typeof payload !== "object") return { estimatedTokens: null, model: null };
    const obj = payload as Record<string, unknown>;

    // Estimate tokens from content/input/text fields (1 token ≈ 4 chars)
    let textLength = 0;
    const textFields = ["content", "input", "text", "prompt", "query"];
    for (const field of textFields) {
      const val = obj[field];
      if (typeof val === "string") textLength += val.length;
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === "string") textLength += item.length;
          if (item && typeof item === "object") {
            const content = (item as Record<string, unknown>).content;
            if (typeof content === "string") textLength += content.length;
          }
        }
      }
    }

    const model =
      typeof obj.model === "string" ? obj.model :
      typeof obj.model_id === "string" ? obj.model_id : null;

    return {
      estimatedTokens: textLength > 0 ? Math.round(textLength / 4) : null,
      model,
    };
  };

  // Apply token limit and/or model override to a payload object.
  // Token limit truncates string content fields at approx chars (tokens * 4).
  const applyPayloadOverrides = (
    payload: unknown,
    tokenLimit: number | null,
    modelOverride: string,
  ): unknown => {
    if (!payload || typeof payload !== "object") return payload;
    const result = { ...(payload as Record<string, unknown>) };

    if (modelOverride.trim()) {
      if ("model" in result) result.model = modelOverride.trim();
      if ("model_id" in result) result.model_id = modelOverride.trim();
    }

    if (tokenLimit !== null && tokenLimit > 0) {
      const charLimit = tokenLimit * 4;
      const truncateStr = (s: string) =>
        s.length > charLimit ? `${s.slice(0, charLimit)}… [truncated to ~${tokenLimit} tokens by Rifft override]` : s;

      const textFields = ["content", "input", "text", "prompt", "query"];
      for (const field of textFields) {
        const val = result[field];
        if (typeof val === "string") {
          result[field] = truncateStr(val);
        } else if (Array.isArray(val)) {
          result[field] = val.map((item) => {
            if (typeof item === "string") return truncateStr(item);
            if (item && typeof item === "object") {
              const msg = item as Record<string, unknown>;
              if (typeof msg.content === "string") return { ...msg, content: truncateStr(msg.content) };
            }
            return item;
          });
        }
      }
    }

    return result;
  };

  // Simple line-level diff: returns segments tagged added/removed/unchanged.
  const computeLineDiff = (original: string, modified: string) => {
    if (original === modified) return null;
    const origLines = original.split("\n");
    const modLines = modified.split("\n");
    const maxLen = Math.max(origLines.length, modLines.length);
    const segments: Array<{ type: "unchanged" | "removed" | "added"; line: string }> = [];
    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const m = modLines[i];
      if (o === m) {
        if (o !== undefined) segments.push({ type: "unchanged", line: o });
      } else {
        if (o !== undefined) segments.push({ type: "removed", line: o });
        if (m !== undefined) segments.push({ type: "added", line: m });
      }
    }
    return segments;
  };

  const openForkDialog = (message = selectedMessage, draft = selectedDraft) => {
    if (!message) return;
    setSelectedSpanId(message.span_id);
    const raw = JSON.stringify(draft?.payload ?? message.message ?? null, null, 2);
    setForkPayload(raw);
    setForkOriginalPayload(raw);
    setForkSaved(false);
    setTokenLimitInput("");
    setModelOverrideInput("");
    setReplayResult(null);
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
      toast.success("Replay payload saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("400")) {
        toast.error("Replay payload must be valid JSON");
      } else if (message.includes("401")) {
        toast.error("Your session expired. Refresh the page and try again.");
      } else {
        toast.error("Rifft could not save this replay payload right now.");
      }
    }
  };

  const replayCurrentPayload = async () => {
    if (!selectedMessage || !parsedForkPayload.valid) return;

    try {
      setIsReplaying(true);
      setReplayResult(null);
      const result = await replayFromSpan(trace.trace_id, selectedMessage.span_id, parsedForkPayload.value);
      setReplayResult(result);
      if (result.status === "passed") {
        toast.success("Replay passed.");
      } else {
        toast.error(result.error ?? "Replay failed.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Replay hook is not available.");
    } finally {
      setIsReplaying(false);
    }
  };

  const selectReplaySpanAt = (index: number) => {
    const next = Math.max(0, Math.min(index, replaySpans.length - 1));
    const span = replaySpans[next];
    if (!span) return;

    setReplayIndex(next);
    setSelectedSpanId(span.span_id);
    setSelectedAgentId(span.target_agent_id);
  };

  const enterReplayMode = () => {
    if (replaySpans.length === 0) return;

    const selectedIndex = selectedSpanId
      ? replaySpans.findIndex((span) => span.span_id === selectedSpanId)
      : -1;

    setReplayMode(true);
    setActiveTab("graph");
    selectReplaySpanAt(selectedIndex >= 0 ? selectedIndex : 0);
  };

  const stepReplay = (direction: -1 | 1) => {
    if (replaySpans.length === 0) return;

    selectReplaySpanAt(replayIndex + direction);
  };

  return (
    <>
      <div className="space-y-6 px-6 py-6">
        <FailureExplanationCard
          traceId={trace.trace_id}
          canRegenerate={canRegenerateFailureExplanation}
          hasFatalFailure={trace.mast_failures.some((failure) => failure.severity === "fatal")}
          primaryFailure={trace.mast_failures[0] ?? null}
          rootCauseAgent={trace.causal_attribution.root_cause_agent_id}
          failingAgent={trace.causal_attribution.failing_agent_id}
          causalChain={trace.causal_attribution.causal_chain}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="space-y-6">
            {focusMessage ? (
              <Card className="rounded-3xl border-chart-1/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.08,transparent_36%),hsl(var(--card))] shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        First bad handoff
                      </div>
                      <div className="font-mono text-sm">
                        {focusMessage.source_agent_id} {"->"} {focusMessage.target_agent_id}
                      </div>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        Start here. This is the earliest recorded message in the replay path, so it is the best place to inspect where the conversation first drifted.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openMessageOverlay(focusMessage.span_id, focusMessage.target_agent_id)}
                      >
                        Inspect handoff
                      </Button>
                      <Button
                        onClick={() => {
                          openForkDialog(focusMessage, focusDraft);
                        }}
                      >
                        Try a fix
                      </Button>
                    </div>
                  </div>
                  {focusPayloadHints.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {focusPayloadHints.map((hint) => (
                        <div key={hint} className="rounded-2xl border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                          {hint}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {liveState.isLive || liveState.sessionExpired ? (
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
              </CardContent>
            </Card>
            ) : null}

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "graph" | "timeline")} className="section-fade space-y-4">
              <div className="flex flex-col gap-4 rounded-3xl border bg-card/70 p-4 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <TabsList>
                    <TabsTrigger value="graph">Conversation path</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  </TabsList>
                </div>
                <div className="text-sm text-muted-foreground">
                  {replayMode
                    ? "Stepping through recorded messages. This does not rerun your pipeline."
                    : `${trace.communication_spans.length} recorded message${trace.communication_spans.length === 1 ? "" : "s"}`}
                </div>
              </div>

              <TabsContent value="graph" className="mt-0">
                <Card className="overflow-hidden rounded-3xl border-border/70 bg-card/85 p-0 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b px-6 py-4">
                    <div>
                      <div className="text-sm font-medium">Conversation path</div>
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
                      ) : null}
                    </div>

                    {/* Graph legend — top-right corner */}
                    {graph.edges.length > 0 ? (
                      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col gap-1.5 rounded-2xl border bg-background/90 px-3 py-2.5 text-xs text-muted-foreground shadow backdrop-blur">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm border-2 border-destructive" />
                          Root cause agent
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm border-2 border-yellow-500" />
                          Has MAST failures
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm border-2 border-border" />
                          Healthy
                        </div>
                        <div className="mt-0.5 border-t pt-1.5 text-[10px]">
                          Click a node or arrow to inspect
                        </div>
                      </div>
                    ) : null}
                    {graph.edges.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                        <div className="rounded-2xl border border-dashed bg-muted/20 p-8">
                          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/40" />
                          <div className="mt-4 text-sm font-medium">No inter-agent communication captured</div>
                          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                            This trace contains{" "}
                            {graph.nodes.length === 1 ? "a single agent" : `${graph.nodes.length} agents`}{" "}
                            with no recorded messages between them. Check your SDK instrumentation if
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
                        </ReactFlow>
                      </ReactFlowProvider>
                    )}
                    {graph.edges.length > 0 ? (
                    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl border bg-background/90 p-2 shadow-lg backdrop-blur">
                      {replayMode ? (
                        <>
                          <Button variant="outline" disabled={!canStepReplayBack} onClick={() => stepReplay(-1)}>
                            Step back
                          </Button>
                          <Button disabled={!canStepReplayForward} onClick={() => stepReplay(1)}>Step forward</Button>
                          <Badge variant="outline" className="px-3 py-2">
                            {replayProgressLabel}
                          </Badge>
                          <Button variant="outline" onClick={() => openForkDialog()}>
                            Try a fix
                          </Button>
                          <Button variant="ghost" onClick={() => setReplayMode(false)}>
                            Exit step-through
                          </Button>
                        </>
                      ) : (
                        <Button onClick={enterReplayMode}>
                          <Play className="h-4 w-4" />
                          {replaySpans.length === 1 ? "Inspect conversation" : "Follow conversation"}
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
            {trace.communication_spans.length > 0 ? (
            <>
            <Card className="rounded-3xl border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  {selectedMessage ? "Selected handoff" : "First bad handoff"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {focusMessage ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{focusMessage.protocol}</Badge>
                      <Badge variant={statusVariant(focusMessage.status)}>{focusMessage.status}</Badge>
                      <Badge variant="outline">{focusMessage.duration_ms}ms</Badge>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-sm font-medium">
                        {focusMessage.source_agent_id} {"->"} {focusMessage.target_agent_id}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedMessage
                          ? "You are inspecting the currently selected handoff."
                          : "No handoff is selected yet, so Rifft is showing the first message in the replay path."}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="mb-2 text-sm font-medium">What this agent passed on</div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                        {formatJsonPreview(focusMessage.message)}
                      </pre>
                    </div>
                    {focusDraft ? (
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <div className="mb-2 text-sm font-medium">Saved replay payload</div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                          {formatJsonPreview(focusDraft.payload)}
                        </pre>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => openMessageOverlay(focusMessage.span_id, focusMessage.target_agent_id)}>
                        Open full handoff
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          openForkDialog(focusMessage, focusDraft);
                        }}
                      >
                        Try a fix
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a connection in the conversation path to inspect the message.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  What changed here
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {focusPayloadHints.length > 0 ? (
                  focusPayloadHints.map((hint) => (
                    <div key={hint} className="rounded-2xl border p-4 text-sm text-muted-foreground">
                      {hint}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {focusMessage
                      ? "Rifft does not have a compact change summary for this handoff yet."
                      : "Select a connection in the graph to see what changed."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  What happened next
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedPathFailures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {focusMessage
                      ? "Rifft has not attached a downstream failure summary to this handoff yet."
                      : "Select a connection in the graph to see what happened next."}
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
              <Tabs
                key={selectedAgent.summary.agent_id}
                defaultValue="messages"
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="mx-6 mt-4 w-auto justify-start rounded-xl">
                  <TabsTrigger value="messages">
                    Saw
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
                    <TabsTrigger value="context">Decisions</TabsTrigger>
                  ) : null}
                  {agentDiffByAgent.has(selectedAgent.summary.agent_id) ? (
                    <TabsTrigger value="history">History</TabsTrigger>
                  ) : null}
                </TabsList>
                <ScrollArea className="flex-1">
                  <TabsContent value="messages" className="mt-0 px-6 py-4">
                    {selectedAgent.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No incoming or outgoing handoffs were recorded for this agent.
                      </p>
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
                  {(() => {
                    const diff = agentDiffByAgent.get(selectedAgent.summary.agent_id);
                    if (!diff) return null;
                    const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
                    const fmtMs = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
                    const total = diff.fatal_activations + diff.successful_activations;
                    const fatalPct = Math.round((diff.fatal_activations / total) * 100);
                    return (
                      <TabsContent value="history" className="mt-0 px-6 py-4 space-y-4">
                        <div className="rounded-xl border bg-muted/20 px-4 py-3 space-y-1">
                          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">30-day activations</div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="text-xl font-mono font-semibold">{total}</div>
                            <div className="text-sm text-muted-foreground">
                              <span className="text-destructive font-medium">{diff.fatal_activations} fatal</span>
                              {" "}({fatalPct}%){" · "}
                              <span className="text-emerald-500 font-medium">{diff.successful_activations} successful</span>
                            </div>
                          </div>
                        </div>

                        {diff.input_tokens ? (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Peak input tokens</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                                <div className="text-[10px] uppercase tracking-[0.14em] text-destructive/70">Fatal runs</div>
                                <div className="font-mono text-lg font-semibold text-destructive">{fmtTokens(diff.input_tokens.fatal_median)}</div>
                                <div className="text-[10px] text-muted-foreground">median · p90 {fmtTokens(diff.input_tokens.fatal_p90)}</div>
                              </div>
                              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                                <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Successful runs</div>
                                <div className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">{fmtTokens(diff.input_tokens.success_median)}</div>
                                <div className="text-[10px] text-muted-foreground">median · p90 {fmtTokens(diff.input_tokens.success_p90)}</div>
                              </div>
                            </div>
                            {diff.input_tokens.divergence_ratio >= 1.5 ? (
                              <p className="text-xs text-muted-foreground">
                                Fatal runs arrive with <span className="font-medium text-foreground">{diff.input_tokens.divergence_ratio.toFixed(1)}×</span> more input tokens than successful ones.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {diff.duration_ms ? (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Total duration</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                                <div className="text-[10px] uppercase tracking-[0.14em] text-destructive/70">Fatal runs</div>
                                <div className="font-mono text-lg font-semibold text-destructive">{fmtMs(diff.duration_ms.fatal_median)}</div>
                                <div className="text-[10px] text-muted-foreground">median · p90 {fmtMs(diff.duration_ms.fatal_p90)}</div>
                              </div>
                              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                                <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Successful runs</div>
                                <div className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">{fmtMs(diff.duration_ms.success_median)}</div>
                                <div className="text-[10px] text-muted-foreground">median · p90 {fmtMs(diff.duration_ms.success_p90)}</div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </TabsContent>
                    );
                  })()}
                </ScrollArea>
              </Tabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={forkOpen} onOpenChange={(open) => { setForkOpen(open); if (!open) { setForkSaved(false); setForkOriginalPayload(""); setTokenLimitInput(""); setModelOverrideInput(""); setReplayResult(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit &amp; replay payload</DialogTitle>
            <DialogDescription>
              Edit the payload below, then save it for later use with your own tooling, or run it through your replay hook now to see whether the fix holds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {suggestedForkPayload ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                      Suggested payload edit
                    </div>
                    <p className="max-w-xl text-sm text-emerald-800/80 dark:text-emerald-200/80">
                      Rifft found an unsupported claim in this message. Try moving it to removed_claims,
                      then replay from here to see whether the fix holds.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setForkPayload(suggestedForkPayload.formatted);
                      setReplayResult(null);
                      setForkSaved(false);
                      toast.success("Suggested payload applied.");
                    }}
                  >
                    Use suggested payload
                  </Button>
                </div>
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 text-xs text-muted-foreground">
                  {suggestedForkPayload.formatted}
                </pre>
              </div>
            ) : null}

            {/* Parameter overrides panel */}
            {(() => {
              const detected = parsedForkPayload.valid ? detectPayloadParams(parsedForkPayload.value) : { estimatedTokens: null, model: null };
              const hasOverridableParams = detected.estimatedTokens !== null || detected.model !== null;
              if (!hasOverridableParams) return null;
              return (
                <div className="rounded-xl border bg-muted/20 px-4 py-3 space-y-3">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Parameter overrides</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detected.estimatedTokens !== null ? (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">
                          Truncate to tokens
                          <span className="ml-1 text-muted-foreground/60">(est. {detected.estimatedTokens.toLocaleString()} now)</span>
                        </label>
                        <Input
                          type="number"
                          placeholder={String(detected.estimatedTokens)}
                          value={tokenLimitInput}
                          onChange={(e) => setTokenLimitInput(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    ) : null}
                    {detected.model !== null ? (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Swap model</label>
                        <Input
                          placeholder={detected.model}
                          value={modelOverrideInput}
                          onChange={(e) => setModelOverrideInput(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!tokenLimitInput && !modelOverrideInput}
                    onClick={() => {
                      if (!parsedForkPayload.valid) return;
                      const tokenLimit = tokenLimitInput ? Number(tokenLimitInput) : null;
                      const modified = applyPayloadOverrides(parsedForkPayload.value, tokenLimit, modelOverrideInput);
                      setForkPayload(JSON.stringify(modified, null, 2));
                    }}
                  >
                    Apply overrides to payload
                  </Button>
                </div>
              );
            })()}

            {/* Diff view — shown when payload differs from original */}
            {(() => {
              if (!forkOriginalPayload || forkPayload === forkOriginalPayload) return null;
              const diff = computeLineDiff(forkOriginalPayload, forkPayload);
              if (!diff) return null;
              const changed = diff.filter((s) => s.type !== "unchanged");
              if (changed.length === 0) return null;
              return (
                <div className="rounded-xl border bg-muted/10 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                    <span className="text-xs font-medium text-muted-foreground">Changes from original</span>
                    <span className="text-xs text-muted-foreground">{changed.length} line{changed.length === 1 ? "" : "s"} changed</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {diff.filter((s) => s.type !== "unchanged" || /* show context */ false).slice(0, 60).map((seg, i) => (
                      seg.type === "unchanged" ? null : (
                        <div
                          key={i}
                          className={`px-3 py-0.5 font-mono text-[11px] ${
                            seg.type === "removed"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400 line-through"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {seg.type === "removed" ? "− " : "+ "}{seg.line}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              );
            })()}

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
              className="min-h-64 font-mono text-xs"
              value={forkPayload}
              onChange={(event) => setForkPayload(event.target.value)}
            />
            {!parsedForkPayload.valid ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {parsedForkPayload.error}
              </div>
            ) : forkSaved ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Payload saved. Use it with your replay hook or rerun command, then open the new trace to see whether the fix held.
              </div>
            ) : replayResult ? (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  replayResult.status === "passed"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Replay {replayResult.status}
                    {replayResult.error ? <span> · {replayResult.error}</span> : null}
                  </span>
                  {replayResult.source_trace_id ? (
                    <a
                      href={`/traces/${replayResult.source_trace_id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      View replay trace →
                    </a>
                  ) : (
                    <span className="font-mono text-xs opacity-70">{replayResult.runId}</span>
                  )}
                </div>
              </div>
            ) : !replayHookConfigured ? (
              <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-2">
                <div className="text-sm font-medium">Set up a replay hook to run fixes live</div>
                <p className="text-sm text-muted-foreground">
                  Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">RIFFT_REPLAY_HOOK_URL</code> to an endpoint on your infrastructure. Rifft will POST to it and wait for a result.
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground">{`// Request\nPOST $RIFFT_REPLAY_HOOK_URL\n{ "trace_id": "...", "span_id": "...", "payload": { ... } }\n\n// Response\n{ "runId": "...", "status": "passed" | "failed", "source_trace_id"?: "..." }`}</pre>
                <p className="text-xs text-muted-foreground">
                  You can still save the payload below and replay it with your own tooling.
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Rifft will keep this payload attached to the selected message.
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!parsedForkPayload.valid}
              onClick={() => {
                void navigator.clipboard.writeText(forkPayload);
                toast.success("Payload copied to clipboard");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy payload
            </Button>
            <Button variant="ghost" onClick={() => setForkOpen(false)}>
              Cancel
            </Button>
            {replayHookConfigured ? (
              <Button
                variant="outline"
                onClick={() => void replayCurrentPayload()}
                disabled={!parsedForkPayload.valid || isReplaying}
              >
                {isReplaying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Run replay
              </Button>
            ) : null}
            <Button onClick={saveFork} disabled={!parsedForkPayload.valid}>
              Save for later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={messageOverlayOpen} onOpenChange={setMessageOverlayOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Handoff detail</DialogTitle>
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
                  <div className="mb-2 text-sm font-medium">What the next agent saw</div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                    {formatJsonPreview(selectedMessage.message)}
                  </pre>
                </div>
                {selectedDraft ? (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="mb-2 text-sm font-medium">Saved replay payload</div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                      {formatJsonPreview(selectedDraft.payload)}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Why this handoff matters</CardTitle>
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
                        if (overlayOpenedFromSheet.current && overlaySourceAgentId.current) {
                          setSelectedAgentId(overlaySourceAgentId.current);
                        }
                        setSheetOpen(true);
                      }}
                    >
                      {overlayOpenedFromSheet.current ? "Back to agent" : "Open downstream agent"}
                    </Button>
                    <Button
                      onClick={() => {
                        setMessageOverlayOpen(false);
                        openForkDialog(selectedMessage, selectedDraft);
                      }}
                    >
                      Try a fix from this message
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
