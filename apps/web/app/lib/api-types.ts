export type TraceSummary = {
  trace_id: string;
  root_span_name: string | null;
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
  is_primary_workspace?: boolean;
  account_id: string | null;
  owner_email: string | null;
  api_key: string | null;
  project_role: "owner" | "member" | null;
  account_role: "owner" | "member" | null;
  permissions: {
    can_manage_billing: boolean;
    can_rotate_api_keys: boolean;
    can_update_settings: boolean;
  };
  retention_days: number;
  cost_threshold_usd: number;
  timeout_threshold_ms: number;
  retention_overridden_by_plan?: boolean;
  created_at: string;
  updated_at: string;
};

export type CloudProjectSummary = {
  id: string;
  name: string;
  project_role: "owner" | "member" | null;
  account_role: "owner" | "member" | null;
  created_at: string;
  retention_days: number;
  cost_threshold_usd: number;
  timeout_threshold_ms: number;
};

export type ProjectUsageSummary = {
  plan: {
    key: "free" | "pro" | "scale";
    name: string;
    retention_days: number;
    monthly_span_limit: number;
    overage_price_per_100k_usd: number | null;
    support: "community" | "email" | "priority";
    subscription_status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    account_id: string | null;
    provider_subscription_id: string | null;
    last_synced_at: string | null;
  };
  usage: {
    used_spans: number;
    included_spans: number;
    usage_ratio: number;
    period_start: string;
    period_end: string;
    over_limit: boolean;
  };
};

export type ProjectAlerts = {
  available: boolean;
  regression_available: boolean;
  plan_key: "free" | "pro" | "scale";
  fatal_failures_enabled: boolean;
  regression_digest_enabled: boolean;
  slack: {
    configured: boolean;
    target: string | null;
    last_tested_at: string | null;
    last_alert_at: string | null;
    last_error: string | null;
  };
  email: {
    configured: boolean;
    target: string | null;
    last_tested_at: string | null;
    last_alert_at: string | null;
    last_error: string | null;
  };
  recent_deliveries: Array<{
    id: string;
    project_id: string;
    channel: "slack" | "email";
    event_type: "fatal_failure" | "test" | "regression_digest";
    status: "sent" | "failed";
    trace_id: string | null;
    target: string | null;
    error: string | null;
    created_at: string;
  }>;
};

export type ProjectInsightsSummary = {
  recent_trace_window: number;
  insights: Array<{
    mode: string;
    severity: "benign" | "fatal";
    recent_trace_window: number;
    affected_trace_count: number;
    occurrence_count: number;
    share_of_recent_traces: number;
    dominant_agent_id: string | null;
    dominant_agent_share: number | null;
    latest_trace_id: string | null;
    latest_started_at: string | null;
    sample_explanation: string;
    token_pressure: {
      traces_with_signal: number;
      median_input_tokens: number | null;
      max_input_tokens: number | null;
      median_context_limit: number | null;
      near_limit_ratio: number | null;
    } | null;
  }>;
};

export type TraceBaseline = {
  project_id: string;
  trace_id: string;
  label: string | null;
  updated_at: string;
  trace_started_at: string | null;
  trace_status: "ok" | "error" | "unset" | null;
};

export type TraceComparison = {
  baseline: TraceBaseline | null;
  current_trace_id: string;
  verdict: "improved" | "regressed" | "changed" | "same";
  deltas: {
    duration_ms: number;
    cost_usd: number;
    span_count: number;
    agent_count: number;
    failure_count: number;
    fatal_failure_count: number;
  };
  status_transition: {
    baseline: "ok" | "error" | "unset";
    current: "ok" | "error" | "unset";
  };
  failure_modes: {
    new_modes: string[];
    resolved_modes: string[];
    persisting_modes: string[];
  };
  root_cause: {
    baseline: string | null;
    current: string | null;
  };
};

export type TraceDetail = {
  trace_id: string;
  project_id: string;
  root_span_name: string | null;
  started_at: string;
  ended_at: string;
  updated_at: string;
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

export type TraceFailureExplanation = {
  trace_id: string;
  project_id: string;
  summary: string;
  evidence: string[];
  recommended_fix: string;
  confidence: "high" | "medium" | "low";
  model: string;
  generated_at: string;
  updated_at: string;
};

export type TraceLiveSnapshot = {
  trace: TraceDetail;
  graph: TraceGraph;
  timeline: TraceTimeline;
  live: {
    is_live: boolean;
    last_activity_at: string;
  };
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

export type OptimizationSuggestionType =
  | "cost_dominant_agent"
  | "latency_bottleneck"
  | "model_downgrade";

export type OptimizationSuggestion = {
  id: string;
  type: OptimizationSuggestionType;
  severity: "high" | "medium";
  title: string;
  explanation: string;
  estimated_saving: string | null;
  agent_id: string | null;
  traces_analyzed: number;
};

export type OptimizationSuggestionsResult = {
  suggestions: OptimizationSuggestion[];
  traces_analyzed: number;
  days_analyzed: number;
};
