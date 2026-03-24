const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type TraceSummary = {
  trace_id: string;
  started_at: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  agent_count: number;
  total_cost_usd: number;
  mast_failures: Array<{
    mode: string;
    severity: "benign" | "fatal";
    agent_id: string | null;
    explanation: string;
  }>;
  framework: string[];
};

export type ProjectSettings = {
  id: string;
  name: string;
  api_key: string;
  retention_days: number;
  cost_threshold_usd: number;
  timeout_threshold_ms: number;
  created_at: string;
  updated_at: string;
};

export type TraceDetail = {
  trace_id: string;
  project_id: string;
  root_span_name: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  framework: string[];
  agent_count: number;
  span_count: number;
  total_cost_usd: number;
  mast_failures: Array<{
    mode: string;
    severity: "benign" | "fatal";
    agent_id: string | null;
    explanation: string;
  }>;
  causal_attribution: {
    root_cause_agent_id: string | null;
    failing_agent_id: string | null;
    causal_chain: string[];
    explanation: string | null;
  };
  spans: Array<{
    span_id: string;
    parent_span_id: string | null;
    name: string;
    start_time: string;
    end_time: string;
    duration_ms: number;
    status: string;
    framework: string;
    agent_id: string | null;
    attributes: Record<string, unknown>;
  }>;
  communication_spans: Array<{
    span_id: string;
    parent_span_id: string | null;
    name: string;
    source_agent_id: string;
    target_agent_id: string;
    message: unknown;
    protocol: string;
    start_time: string;
    end_time: string;
    duration_ms: number;
    status: string;
    framework: string;
  }>;
};

export type TraceGraph = {
  nodes: Array<{
    id: string;
    framework: string;
    status: string;
    cost_usd: number;
    duration_ms: number;
    root_cause: boolean;
  }>;
  edges: Array<{
    source: string;
    target: string;
    message_count: number;
    first_message_at: string;
    status: string;
    duration_ms: number;
  }>;
  causal_attribution: {
    root_cause_agent_id: string | null;
    failing_agent_id: string | null;
    causal_chain: string[];
    explanation: string | null;
  };
  communication_spans: Array<{
    span_id: string;
    source_agent_id: string;
    target_agent_id: string;
    message: unknown;
    protocol: string;
    start_time: string;
    end_time: string;
    duration_ms: number;
    status: string;
  }>;
};

export type TraceTimeline = {
  agents: Array<{
    agent_id: string;
    start_ms: number;
    end_ms: number;
    duration_ms: number;
    status: string;
  }>;
  spans: Array<{
    span_id: string;
    agent_id: string | null;
    name: string;
    start_ms: number;
    end_ms: number;
    duration_ms: number;
    status: string;
    framework: string;
    span_type: string;
  }>;
  communication_spans: Array<{
    span_id: string;
    source_agent_id: string;
    target_agent_id: string;
    message: unknown;
    protocol: string;
    start_ms: number;
    end_ms: number;
    duration_ms: number;
    status: string;
    framework: string;
  }>;
};

export type AgentDetail = {
  summary: {
    agent_id: string;
    framework: string;
    status: string;
    total_cost_usd: number;
    total_duration_ms: number;
  };
  messages: Array<{
    span_id: string;
    name: string;
    sender: string;
    receiver: string;
    timestamp: string;
    payload: unknown;
    protocol: string;
  }>;
  tool_calls: Array<{
    span_id: string;
    tool_name: string;
    input: unknown;
    output: unknown;
    duration_ms: number;
  }>;
  mast_failures: Array<{
    mode: string;
    severity: "benign" | "fatal";
    agent_id: string | null;
    explanation: string;
  }>;
  decision_context: unknown;
};

export type ForkDraft = {
  trace_id: string;
  span_id: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const getProjectSettings = () => fetchJson<ProjectSettings>("/projects/default");

export const getTraces = async () => {
  return fetchJson<{ traces: TraceSummary[]; total: number; page: number }>("/projects/default/traces");
};

export const getTraceDetail = (traceId: string) => fetchJson<TraceDetail>(`/traces/${traceId}`);
export const getTraceGraph = (traceId: string) => fetchJson<TraceGraph>(`/traces/${traceId}/graph`);
export const getTraceTimeline = (traceId: string) =>
  fetchJson<TraceTimeline>(`/traces/${traceId}/timeline`);
export const getAgentDetail = (traceId: string, agentId: string) =>
  fetchJson<AgentDetail>(`/traces/${traceId}/agents/${agentId}`);
export const getForkDrafts = async (traceId: string) =>
  fetchJson<{ drafts: ForkDraft[] }>(`/traces/${traceId}/fork-drafts`);
export const saveForkDraft = (traceId: string, spanId: string, payload: unknown) =>
  fetchJson<ForkDraft>(`/traces/${traceId}/fork-drafts/${spanId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
