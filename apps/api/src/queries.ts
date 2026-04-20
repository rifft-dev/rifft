import { randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { queryClickHouse, pgPool } from "./db.js";
import {
  getPermissionsForRoles,
  type MembershipRole,
  type ProjectPermissions,
} from "./membership.js";

type TraceListFilters = {
  projectId: string;
  page: number;
  pageSize: number;
  status?: string;
  framework?: string;
  from?: string;
  to?: string;
};

type SpanRow = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: string;
  attributes: string;
  events: string;
  resource: string;
  agent_id: string;
  framework: string;
  project_id: string;
};

type ParsedSpan = Omit<SpanRow, "attributes" | "events" | "resource" | "agent_id"> & {
  attributes: Record<string, unknown>;
  events: unknown[];
  resource: Record<string, unknown>;
  start_time: string;
  end_time: string;
  agent_id: string | null;
};

type CommunicationSpan = {
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
  attributes: Record<string, unknown>;
};

type MastFailure = {
  mode: string;
  severity: "benign" | "fatal";
  agent_id: string | null;
  explanation: string;
};

type CausalAttribution = {
  root_cause_agent_id: string | null;
  failing_agent_id: string | null;
  causal_chain: string[];
  explanation: string | null;
};

type ForkDraft = {
  trace_id: string;
  span_id: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

type CloudBootstrapInput = {
  userId: string;
  email: string | null;
  name: string | null;
};

type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type ProjectAccessContext = {
  projectRole: MembershipRole | null;
  accountRole: MembershipRole | null;
  permissions: ProjectPermissions;
};

type ApiKeyRow = {
  id: string;
  project_id: string;
  token: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string | Date;
};

type UsageCountRow = {
  total: number | string;
};

type ProjectInsight = {
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
};

type InsightClickHouseRow = {
  trace_id: string;
  agent_id: string;
  attributes: string;
};

type TraceBaselineRecord = {
  project_id: string;
  trace_id: string;
  label: string | null;
  updated_at: string;
  trace_started_at: string | null;
  trace_status: "ok" | "error" | "unset" | null;
};

export type ProjectAlertChannel = "slack" | "email";

export type ProjectAlertEventType = "fatal_failure" | "test" | "regression_digest";

export type ProjectAlertDeliveryStatus = "sent" | "failed";

type ProjectAlertDeliveryRecord = {
  id: string;
  project_id: string;
  channel: ProjectAlertChannel;
  event_type: ProjectAlertEventType;
  status: ProjectAlertDeliveryStatus;
  trace_id: string | null;
  target: string | null;
  error: string | null;
  created_at: string;
};

type ProjectAlertChannelSettings = {
  configured: boolean;
  target: string | null;
  last_tested_at: string | null;
  last_alert_at: string | null;
  last_error: string | null;
};

export type ProjectAlertSettings = {
  available: boolean;
  regression_available: boolean;
  plan_key: "free" | "pro" | "scale";
  fatal_failures_enabled: boolean;
  regression_digest_enabled: boolean;
  slack: ProjectAlertChannelSettings;
  email: ProjectAlertChannelSettings;
  recent_deliveries: ProjectAlertDeliveryRecord[];
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

type TraceComparisonSummary = {
  baseline: TraceBaselineRecord | null;
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

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const escapeValue = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

const toIsoTimestamp = (value: string | Date) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value.includes("T")) {
    return value;
  }

  return `${value.replace(" ", "T")}Z`;
};

const normalizeAgentId = (value: string) => (value === "unknown" ? null : value);

const parseSpan = (span: SpanRow): ParsedSpan => ({
  ...span,
  start_time: toIsoTimestamp(span.start_time),
  end_time: toIsoTimestamp(span.end_time),
  agent_id: normalizeAgentId(span.agent_id),
  attributes: parseJson<Record<string, unknown>>(span.attributes, {}),
  events: parseJson<unknown[]>(span.events, []),
  resource: parseJson<Record<string, unknown>>(span.resource, {}),
});

const dedupeByKey = <T>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const maskSlackWebhookTarget = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const suffix = value.slice(-4);
    return `${url.host} ••••${suffix}`;
  } catch {
    const suffix = value.slice(-4);
    return `Slack webhook ••••${suffix}`;
  }
};

const toIsoOrNull = (value: unknown) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value : null;
};

const median = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle] ?? null;
};

const normalizeMembershipRole = (value: unknown): MembershipRole | null => {
  if (value === "owner") {
    return "owner";
  }

  if (value === "member") {
    return "member";
  }

  return null;
};

let forkDraftsTableEnsured = false;
let cloudProjectOwnershipEnsured = false;
let cloudMembershipEnsured = false;
let apiKeysTableEnsured = false;
let subscriptionsTableEnsured = false;
let traceBaselinesTableEnsured = false;
let projectAlertsEnsured = false;
let traceFailureExplanationsEnsured = false;

const ensureForkDraftsTable = async () => {
  if (forkDraftsTableEnsured) {
    return;
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS fork_drafts (
      trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
      span_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (trace_id, span_id)
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS fork_drafts_trace_updated_at_idx
      ON fork_drafts (trace_id, updated_at DESC)
  `);

  forkDraftsTableEnsured = true;
};

const ensureCloudProjectOwnership = async () => {
  if (cloudProjectOwnershipEnsured) {
    return;
  }

  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT
  `);
  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS owner_email TEXT
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS projects_owner_user_id_idx
      ON projects (owner_user_id)
  `);

  cloudProjectOwnershipEnsured = true;
};

const ensureCloudMemberships = async () => {
  if (cloudMembershipEnsured) {
    return;
  }

  await ensureCloudProjectOwnership();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      owner_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS account_memberships (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_email TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, user_id)
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS project_memberships (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_email TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    )
  `);
  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS account_id TEXT
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS accounts_owner_user_id_idx
      ON accounts (owner_user_id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS project_memberships_user_id_idx
      ON project_memberships (user_id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS projects_account_id_idx
      ON projects (account_id)
  `);

  cloudMembershipEnsured = true;
};

const ensureApiKeysTable = async () => {
  if (apiKeysTableEnsured) {
    return;
  }

  await pgPool.query(`
    ALTER TABLE projects
    ALTER COLUMN api_key DROP NOT NULL
  `).catch(() => undefined);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'default',
      token TEXT NOT NULL UNIQUE,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS api_keys_project_id_idx
      ON api_keys (project_id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS api_keys_token_active_idx
      ON api_keys (token)
      WHERE revoked_at IS NULL
  `);

  apiKeysTableEnsured = true;
};

const ensureSubscriptionsTable = async () => {
  if (subscriptionsTableEnsured) {
    return;
  }

  await ensureCloudMemberships();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'polar',
      provider_subscription_id TEXT NOT NULL UNIQUE,
      provider_customer_id TEXT,
      customer_email TEXT,
      plan_key TEXT NOT NULL,
      status TEXT NOT NULL,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      raw_event JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS subscriptions_account_id_idx
      ON subscriptions (account_id, updated_at DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS subscriptions_customer_email_idx
      ON subscriptions (customer_email)
  `);

  subscriptionsTableEnsured = true;
};

const ensureProjectAlerts = async () => {
  if (projectAlertsEnsured) {
    return;
  }

  await ensureSubscriptionsTable();

  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS fatal_failure_alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS regression_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT
  `);
  await pgPool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS alert_email TEXT
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS project_alert_deliveries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      trace_id TEXT,
      target_label TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS project_alert_deliveries_project_created_idx
      ON project_alert_deliveries (project_id, created_at DESC)
  `);

  projectAlertsEnsured = true;
};

const ensureTraceFailureExplanations = async () => {
  if (traceFailureExplanationsEnsured) {
    return;
  }

  await ensureCloudMemberships();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS trace_failure_explanations (
      trace_id TEXT PRIMARY KEY REFERENCES traces(trace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      evidence JSONB NOT NULL,
      recommended_fix TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'medium',
      model TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS trace_failure_explanations_project_updated_idx
      ON trace_failure_explanations (project_id, updated_at DESC)
  `);

  traceFailureExplanationsEnsured = true;
};

const ensureTraceBaselinesTable = async () => {
  if (traceBaselinesTableEnsured) {
    return;
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS trace_baselines (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
      label TEXT,
      updated_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS trace_baselines_trace_id_idx
      ON trace_baselines (trace_id)
  `);

  traceBaselinesTableEnsured = true;
};

const buildCausalAttribution = (
  communicationSpans: CommunicationSpan[],
  mastFailures: MastFailure[],
  executionSpans: ParsedSpan[],
): CausalAttribution => {
  const fatalFailureAgents = mastFailures
    .filter((failure) => failure.severity === "fatal" && failure.agent_id)
    .map((failure) => failure.agent_id)
    .filter((agentId): agentId is string => Boolean(agentId));
  const errorAgents = executionSpans
    .filter((span) => span.agent_id && span.status === "error")
    .map((span) => span.agent_id)
    .filter((agentId): agentId is string => Boolean(agentId));
  const failingAgentId = [...fatalFailureAgents, ...errorAgents][0] ?? null;

  if (!failingAgentId) {
    return {
      root_cause_agent_id: null,
      failing_agent_id: null,
      causal_chain: [],
      explanation: null,
    };
  }

  const spansByTime = [...communicationSpans].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
  const chain: string[] = [failingAgentId];
  const visitedAgents = new Set<string>([failingAgentId]);
  let cursor = failingAgentId;
  let maxIterations = communicationSpans.length + 1;

  while (maxIterations-- > 0) {
    const latestInbound = [...spansByTime]
      .reverse()
      .find((span) => span.target_agent_id === cursor && !visitedAgents.has(span.source_agent_id));

    if (!latestInbound) {
      break;
    }

    chain.unshift(latestInbound.source_agent_id);
    visitedAgents.add(latestInbound.source_agent_id);
    cursor = latestInbound.source_agent_id;
  }

  const rootCauseAgentId = chain[0] ?? null;
  const explanation =
    rootCauseAgentId && failingAgentId
      ? `Likely causal path: ${chain.join(" -> ")}. Earliest contributing agent inferred as ${rootCauseAgentId}.`
      : null;

  return {
    root_cause_agent_id: rootCauseAgentId,
    failing_agent_id: failingAgentId,
    causal_chain: chain,
    explanation,
  };
};

type HydratedTrace = NonNullable<Awaited<ReturnType<typeof getTrace>>>;

const buildTraceGraph = (trace: HydratedTrace) => {
  const spans = trace.spans;
  const communicationSpans = trace.communication_spans;
  const agentSpans = spans.filter((span) => Boolean(span.agent_id));
  const nodeMap = new Map<
    string,
    { id: string; framework: string; status: string; cost_usd: number; duration_ms: number; root_cause: boolean }
  >();
  const edgeMap = new Map<
    string,
    { source: string; target: string; message_count: number; first_message_at: string; status: string; duration_ms: number }
  >();

  for (const span of agentSpans) {
    const agentId = span.agent_id;
    if (!agentId) {
      continue;
    }

    const existing = nodeMap.get(agentId);
    const attributes = span.attributes as Record<string, unknown>;
    const cost = Number(attributes["cost_usd"] ?? attributes["llm.cost_usd"] ?? 0) || 0;

    if (!existing) {
      nodeMap.set(agentId, {
        id: agentId,
        framework: span.framework,
        status: span.status,
        cost_usd: cost,
        duration_ms: Number(span.duration_ms),
        root_cause: trace.causal_attribution.root_cause_agent_id === agentId,
      });
      continue;
    }

    existing.duration_ms += Number(span.duration_ms);
    existing.cost_usd += cost;
    existing.status =
      existing.status === "error" || span.status === "error"
        ? "error"
        : existing.status === "ok" || span.status === "ok"
          ? "ok"
          : "unset";
  }

  for (const span of communicationSpans) {
    const key = `${span.source_agent_id}->${span.target_agent_id}`;
    const existing = edgeMap.get(key);

    if (!existing) {
      edgeMap.set(key, {
        source: span.source_agent_id,
        target: span.target_agent_id,
        message_count: 1,
        first_message_at: toIsoTimestamp(span.start_time),
        status: span.status,
        duration_ms: Number(span.duration_ms),
      });
      continue;
    }

    existing.message_count += 1;
    existing.duration_ms += Number(span.duration_ms);
    existing.status =
      existing.status === "error" || span.status === "error"
        ? "error"
        : existing.status === "ok" || span.status === "ok"
          ? "ok"
          : "unset";
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    causal_attribution: trace.causal_attribution,
    communication_spans: communicationSpans.map((span) => ({
      span_id: span.span_id,
      source_agent_id: span.source_agent_id,
      target_agent_id: span.target_agent_id,
      message: span.message,
      protocol: span.protocol,
      start_time: span.start_time,
      end_time: span.end_time,
      duration_ms: span.duration_ms,
      status: span.status,
    })),
  };
};

const buildTraceTimeline = (trace: HydratedTrace) => {
  const traceStart = new Date(trace.started_at).getTime();
  const grouped = new Map<string, { agent_id: string; start_ms: number; end_ms: number; status: string }>();

  for (const span of trace.spans) {
    if (!span.agent_id) {
      continue;
    }

    const startMs = new Date(span.start_time).getTime() - traceStart;
    const endMs = new Date(span.end_time).getTime() - traceStart;
    const existing = grouped.get(span.agent_id);

    if (!existing) {
      grouped.set(span.agent_id, {
        agent_id: span.agent_id,
        start_ms: startMs,
        end_ms: endMs,
        status: span.status,
      });
      continue;
    }

    existing.start_ms = Math.min(existing.start_ms, startMs);
    existing.end_ms = Math.max(existing.end_ms, endMs);
    existing.status =
      existing.status === "error" || span.status === "error"
        ? "error"
        : existing.status === "ok" || span.status === "ok"
          ? "ok"
          : "unset";
  }

  return {
    agents: [...grouped.values()].map((agent) => ({
      agent_id: agent.agent_id,
      start_ms: agent.start_ms,
      end_ms: agent.end_ms,
      duration_ms: Math.max(0, agent.end_ms - agent.start_ms),
      status: agent.status,
    })),
    spans: trace.spans.map((span) => ({
      span_id: span.span_id,
      agent_id: span.agent_id,
      name: span.name,
      start_ms: new Date(span.start_time).getTime() - traceStart,
      end_ms: new Date(span.end_time).getTime() - traceStart,
      duration_ms: span.duration_ms,
      status: span.status,
      framework: span.framework,
      span_type:
        typeof (span.attributes as Record<string, unknown>)["tool.name"] === "string" ||
        typeof (span.attributes as Record<string, unknown>)["mcp.tool_name"] === "string"
          ? "tool_call"
          : "agent_span",
    })),
    communication_spans: trace.communication_spans.map((span) => ({
      span_id: span.span_id,
      source_agent_id: span.source_agent_id,
      target_agent_id: span.target_agent_id,
      message: span.message,
      protocol: span.protocol,
      start_ms: new Date(span.start_time).getTime() - traceStart,
      end_ms: new Date(span.end_time).getTime() - traceStart,
      duration_ms: span.duration_ms,
      status: span.status,
      framework: span.framework,
    })),
  };
};

const getCommunicationSpan = (span: ParsedSpan): CommunicationSpan | null => {
  const source = span.attributes["source_agent_id"];
  const target = span.attributes["target_agent_id"];

  if (typeof source !== "string" || typeof target !== "string") {
    return null;
  }

  return {
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name: span.name,
    source_agent_id: source,
    target_agent_id: target,
    message: span.attributes["message"] ?? span.attributes["input"] ?? null,
    protocol:
      typeof span.attributes["protocol"] === "string"
        ? (span.attributes["protocol"] as string)
        : span.name.startsWith("rifft.agent_to_agent")
          ? "agent_to_agent"
          : "custom",
    start_time: toIsoTimestamp(span.start_time),
    end_time: toIsoTimestamp(span.end_time),
    duration_ms: span.duration_ms,
    status: span.status,
    framework: span.framework,
    attributes: span.attributes,
  };
};

export const listProjects = async () => {
  const result = await pgPool.query(
    `
      SELECT id, name, created_at, retention_days, cost_threshold_usd, timeout_threshold_ms
      FROM projects
      ORDER BY created_at ASC
    `,
  );

  return result.rows.map((row: QueryResultRow) => ({
    id: row.id as string,
    name: row.name as string,
    created_at: row.created_at,
    retention_days: row.retention_days as number,
    cost_threshold_usd: Number(row.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(row.timeout_threshold_ms ?? 0),
  }));
};

export const getProject = async (projectId: string) => {
  await ensureApiKeysTable();

  const result = await pgPool.query(
    `
      SELECT id, name, account_id, retention_days, cost_threshold_usd, timeout_threshold_ms, created_at, updated_at
      FROM projects
      WHERE id = $1
    `,
    [projectId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const apiKey = await ensurePrimaryApiKeyForProject(projectId);
  return toProjectRecord(row, apiKey.token, undefined, { retentionDays: 30 });
};

export const createProject = async (name: string) => {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `project-${Date.now()}`;

  const result = await pgPool.query(
    `
      INSERT INTO projects (id, name)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id, name, account_id, retention_days, created_at, updated_at
    `,
    [id, name],
  );

  const apiKey = await ensurePrimaryApiKeyForProject(id);
  return toProjectRecord(result.rows[0], apiKey.token);
};

const slugifyProjectId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const slugifyAccountId = (value: string) => {
  const slug = slugifyProjectId(value);
  return slug.length > 0 ? slug : `account-${Date.now()}`;
};

const toProjectRecord = (
  row: QueryResultRow,
  apiKey: string | null,
  accessContext?: ProjectAccessContext,
  defaults: { retentionDays?: number; costThresholdUsd?: number; timeoutThresholdMs?: number } = {},
) => ({
  id: row.id as string,
  name: row.name as string,
  account_id: (row.account_id as string | null) ?? null,
  owner_email: (row.owner_email as string | null) ?? null,
  api_key: apiKey,
  project_role: accessContext?.projectRole ?? null,
  account_role: accessContext?.accountRole ?? null,
  permissions:
    accessContext?.permissions ?? getPermissionsForRoles("owner", row.account_id ? "owner" : null),
  retention_days: Number(row.retention_days ?? defaults.retentionDays ?? 14),
  cost_threshold_usd: Number(row.cost_threshold_usd ?? defaults.costThresholdUsd ?? 0),
  timeout_threshold_ms: Number(row.timeout_threshold_ms ?? defaults.timeoutThresholdMs ?? 0),
  created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
});

const toApiKeyToken = () => `rft_live_${randomBytes(18).toString("hex")}`;

const getCloudPlanForRetention = (retentionDays: number) => {
  if (retentionDays >= 365) {
    return {
      key: "scale" as const,
      name: "Cloud Scale",
      monthlySpanLimit: 2_000_000,
      retentionDays: 365,
      overagePricePer100kUsd: 5,
      support: "priority",
    };
  }

  if (retentionDays >= 90) {
    return {
      key: "pro" as const,
      name: "Cloud Pro",
      monthlySpanLimit: 500_000,
      retentionDays: 90,
      overagePricePer100kUsd: 5,
      support: "email",
    };
  }

  return {
    key: "free" as const,
    name: "Cloud Free",
    monthlySpanLimit: 50_000,
    retentionDays: 14,
    overagePricePer100kUsd: null,
    support: "community",
  };
};

const getCloudPlanForKey = (planKey: string) => {
  if (planKey === "scale") {
    return getCloudPlanForRetention(365);
  }

  if (planKey === "pro") {
    return getCloudPlanForRetention(90);
  }

  return getCloudPlanForRetention(14);
};

const getCurrentPlanKeyForProject = async (projectId: string) => {
  const accountId = await getProjectAccountId(projectId);
  if (!accountId) {
    return "free" as const;
  }

  const subscription = await getCurrentSubscriptionForAccount(accountId);
  if (!subscription || !isActiveSubscriptionStatus(subscription.status)) {
    return "free" as const;
  }

  return subscription.plan_key === "scale" ? "scale" : subscription.plan_key === "pro" ? "pro" : "free";
};

export const getProjectPlanKey = async (projectId: string) => getCurrentPlanKeyForProject(projectId);

const isActiveSubscriptionStatus = (status: string) => ["active", "trialing"].includes(status);

const getProjectAccountId = async (projectId: string) => {
  await ensureCloudMemberships();

  const result = await pgPool.query<{ account_id: string | null }>(
    `
      SELECT account_id
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0]?.account_id ?? null;
};

const getCurrentSubscriptionForAccount = async (accountId: string) => {
  await ensureSubscriptionsTable();

  const result = await pgPool.query<QueryResultRow>(
    `
      SELECT
        id,
        account_id,
        provider_subscription_id,
        provider_customer_id,
        customer_email,
        plan_key,
        status,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        updated_at
      FROM subscriptions
      WHERE account_id = $1
      ORDER BY
        CASE
          WHEN status IN ('active', 'trialing') THEN 0
          WHEN status IN ('past_due', 'unpaid') THEN 1
          ELSE 2
        END,
        updated_at DESC
      LIMIT 1
    `,
    [accountId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as string,
    account_id: row.account_id as string,
    provider_subscription_id: row.provider_subscription_id as string,
    provider_customer_id: (row.provider_customer_id as string | null) ?? null,
    customer_email: (row.customer_email as string | null) ?? null,
    plan_key: row.plan_key as string,
    status: row.status as string,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    current_period_start:
      row.current_period_start instanceof Date
        ? row.current_period_start.toISOString()
        : ((row.current_period_start as string | null) ?? null),
    current_period_end:
      row.current_period_end instanceof Date
        ? row.current_period_end.toISOString()
        : ((row.current_period_end as string | null) ?? null),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : ((row.updated_at as string | null) ?? null),
  };
};

const updateAccountProjectRetention = async (accountId: string, retentionDays: number) => {
  await ensureCloudMemberships();

  await pgPool.query(
    `
      UPDATE projects
      SET retention_days = $2,
          updated_at = NOW()
      WHERE account_id = $1
    `,
    [accountId, retentionDays],
  );
};

const getPrimaryApiKeyForProject = async (projectId: string) => {
  await ensureApiKeysTable();

  const result = await pgPool.query<ApiKeyRow>(
    `
      SELECT id, project_id, token, last_used_at, revoked_at, created_at
      FROM api_keys
      WHERE project_id = $1
        AND revoked_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [projectId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
};

const ensurePrimaryApiKeyForProject = async (projectId: string) => {
  const existing = await getPrimaryApiKeyForProject(projectId);
  if (existing) {
    return existing;
  }

  const token = toApiKeyToken();
  await pgPool.query(
    `
      INSERT INTO api_keys (id, project_id, name, token)
      VALUES ($1, $2, 'default', $3)
    `,
    [`key_${randomBytes(12).toString("hex")}`, projectId, token],
  );

  const created = await getPrimaryApiKeyForProject(projectId);
  if (!created) {
    throw new Error("Failed to create primary API key");
  }

  return created;
};

export const bootstrapCloudProject = async ({ userId, email, name }: CloudBootstrapInput) => {
  await ensureCloudMemberships();
  await ensureApiKeysTable();

  const accountName = name?.trim() || email?.split("@")[0] || "Rifft Cloud";
  const accountId = `acct-${slugifyAccountId(userId.slice(0, 12))}`;

  await pgPool.query(
    `
      INSERT INTO accounts (id, name, owner_user_id, owner_email)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        owner_user_id = EXCLUDED.owner_user_id,
        owner_email = EXCLUDED.owner_email,
        updated_at = NOW()
    `,
    [accountId, accountName, userId, email],
  );
  await pgPool.query(
    `
      INSERT INTO account_memberships (account_id, user_id, user_email, role)
      VALUES ($1, $2, $3, 'owner')
      ON CONFLICT (account_id, user_id) DO UPDATE SET
        user_email = EXCLUDED.user_email,
        role = EXCLUDED.role
    `,
    [accountId, userId, email],
  );

  const existing = await pgPool.query(
    `
      SELECT p.id, p.name, p.account_id, p.retention_days, p.created_at, p.updated_at
      FROM projects p
      JOIN project_memberships pm ON pm.project_id = p.id
      WHERE pm.user_id = $1
        AND p.account_id = $2
      ORDER BY
        p.created_at ASC,
        p.id ASC
      LIMIT 1
    `,
    [userId, accountId],
  );

  if (existing.rowCount && existing.rows[0]) {
    const existingProjectId = existing.rows[0].id as string;
    const accessContext = await getProjectAccessContext(userId, existingProjectId);
    const apiKey =
      accessContext?.permissions.can_rotate_api_keys
        ? await ensurePrimaryApiKeyForProject(existingProjectId)
        : null;

    return toProjectRecord(existing.rows[0], apiKey?.token ?? null, accessContext ?? undefined);
  }

  const preferredName =
    name?.trim() ||
    email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "Rifft Cloud";
  const safeBaseId = slugifyProjectId(`cloud-${userId.slice(0, 8)}-${randomBytes(4).toString("hex")}`);
  const projectId = safeBaseId.length > 0 ? safeBaseId : `cloud-${Date.now()}-${randomBytes(4).toString("hex")}`;

  const result = await pgPool.query(
    `
      INSERT INTO projects (
        id,
        name,
        retention_days,
        account_id,
        owner_user_id,
        owner_email
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, account_id, retention_days, created_at, updated_at
    `,
    [projectId, `${preferredName} Cloud`, 14, accountId, userId, email],
  );

  const apiKey = await ensurePrimaryApiKeyForProject(projectId);
  const project = toProjectRecord(
    result.rows[0],
    apiKey.token,
    {
      projectRole: "owner",
      accountRole: "owner",
      permissions: getPermissionsForRoles("owner", "owner"),
    },
  );

  await pgPool.query(
    `
      INSERT INTO project_memberships (project_id, user_id, user_email, role)
      VALUES ($1, $2, $3, 'owner')
      ON CONFLICT (project_id, user_id) DO UPDATE SET
        user_email = EXCLUDED.user_email,
        role = EXCLUDED.role
    `,
    [project.id, userId, email],
  );

  return project;
};

export const createCloudWorkspaceForUser = async ({
  userId,
  email,
  name,
  currentProjectId,
}: {
  userId: string;
  email: string | null;
  name: string;
  currentProjectId?: string | null;
}) => {
  await ensureCloudMemberships();
  await ensureApiKeysTable();

  let accountId: string | null = null;

  if (currentProjectId) {
    const currentProject = await getProjectAccessContext(userId, currentProjectId);
    if (currentProject?.permissions.can_manage_billing) {
      accountId = (currentProject.account_id as string | undefined) ?? null;
    } else if (currentProject) {
      throw new Error("forbidden");
    }
  }

  if (!accountId) {
    const accountMembership = await pgPool.query<QueryResultRow>(
      `
        SELECT account_id, role
        FROM account_memberships
        WHERE user_id = $1
          AND role = 'owner'
        ORDER BY
          account_id ASC
        LIMIT 1
      `,
      [userId],
    );

    accountId = (accountMembership.rows[0]?.account_id as string | undefined) ?? null;
  }

  if (!accountId) {
    throw new Error("missing_account");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("invalid_name");
  }

  const safeBaseId = slugifyProjectId(`${trimmedName}-${randomBytes(4).toString("hex")}`);
  const projectId = safeBaseId.length > 0 ? safeBaseId : `cloud-${Date.now()}-${randomBytes(4).toString("hex")}`;

  const result = await pgPool.query(
    `
      INSERT INTO projects (
        id,
        name,
        retention_days,
        account_id,
        owner_user_id,
        owner_email
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, account_id, retention_days, created_at, updated_at
    `,
    [projectId, trimmedName, 14, accountId, userId, email],
  );

  await pgPool.query(
    `
      INSERT INTO project_memberships (project_id, user_id, user_email, role)
      VALUES ($1, $2, $3, 'owner')
      ON CONFLICT (project_id, user_id) DO UPDATE SET
        user_email = EXCLUDED.user_email,
        role = EXCLUDED.role
    `,
    [projectId, userId, email],
  );

  const accessContext = await getProjectAccessContext(userId, projectId);
  const apiKey =
    accessContext?.permissions.can_rotate_api_keys
      ? await ensurePrimaryApiKeyForProject(projectId)
      : null;

  return toProjectRecord(result.rows[0], apiKey?.token ?? null, accessContext ?? undefined, {
    retentionDays: 30,
  });
};

async function getProjectAccessContext(
  userId: string,
  projectId: string,
): Promise<(QueryResultRow & ProjectAccessContext) | null> {
  await ensureCloudMemberships();

  const result = await pgPool.query<QueryResultRow>(
    `
      SELECT
        p.id,
        p.name,
        p.account_id,
        p.owner_email,
        p.retention_days,
        p.cost_threshold_usd,
        p.timeout_threshold_ms,
        p.created_at,
        p.updated_at,
        pm.role AS project_role,
        am.role AS account_role
      FROM projects p
      JOIN project_memberships pm ON pm.project_id = p.id
      LEFT JOIN account_memberships am
        ON am.account_id = p.account_id
       AND am.user_id = pm.user_id
      WHERE p.id = $1
        AND pm.user_id = $2
      LIMIT 1
    `,
    [projectId, userId],
  );

  if (result.rowCount === 0 || !result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  const projectRole = normalizeMembershipRole(row.project_role);
  const accountRole = normalizeMembershipRole(row.account_role);

  return {
    ...row,
    projectRole,
    accountRole,
    permissions: getPermissionsForRoles(projectRole, accountRole),
  };
}

export const getAccessibleProject = async (userId: string, projectId: string) => {
  await ensureApiKeysTable();

  const accessibleProject = await getProjectAccessContext(userId, projectId);
  if (!accessibleProject) {
    return null;
  }

  const apiKey = accessibleProject.permissions.can_rotate_api_keys
    ? await ensurePrimaryApiKeyForProject(projectId)
    : null;

  return toProjectRecord(accessibleProject, apiKey?.token ?? null, accessibleProject, {
    retentionDays: 30,
  });
};

export const listProjectsForUser = async (userId: string) => {
  await ensureCloudMemberships();

  const result = await pgPool.query(
    `
      SELECT
        p.id,
        p.name,
        p.account_id,
        p.retention_days,
        p.cost_threshold_usd,
        p.timeout_threshold_ms,
        p.created_at,
        pm.role AS project_role,
        am.role AS account_role
      FROM projects p
      JOIN project_memberships pm ON pm.project_id = p.id
      LEFT JOIN account_memberships am
        ON am.account_id = p.account_id
       AND am.user_id = pm.user_id
      WHERE pm.user_id = $1
      ORDER BY
        CASE WHEN am.role = 'owner' THEN 0 ELSE 1 END,
        CASE WHEN pm.role = 'owner' THEN 0 ELSE 1 END,
        p.created_at ASC,
        p.id ASC
    `,
    [userId],
  );

  return result.rows.map((row: QueryResultRow) => ({
    id: row.id as string,
    name: row.name as string,
    project_role: normalizeMembershipRole(row.project_role),
    account_role: normalizeMembershipRole(row.account_role),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    retention_days: Number(row.retention_days ?? 30),
    cost_threshold_usd: Number(row.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(row.timeout_threshold_ms ?? 0),
  }));
};

export const getDefaultProjectForUser = async (userId: string) => {
  await ensureCloudMemberships();
  await ensureApiKeysTable();

  const result = await pgPool.query(
    `
      SELECT p.id, p.name, p.account_id, p.retention_days, p.cost_threshold_usd, p.timeout_threshold_ms, p.created_at, p.updated_at
      FROM projects p
      JOIN project_memberships pm ON pm.project_id = p.id
      LEFT JOIN account_memberships am
        ON am.account_id = p.account_id
       AND am.user_id = pm.user_id
      WHERE pm.user_id = $1
      ORDER BY
        CASE WHEN am.role = 'owner' THEN 0 ELSE 1 END,
        CASE WHEN pm.role = 'owner' THEN 0 ELSE 1 END,
        p.created_at ASC,
        p.id ASC
      LIMIT 1
    `,
    [userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const apiKey = await ensurePrimaryApiKeyForProject(result.rows[0].id as string);
  return toProjectRecord(result.rows[0], apiKey.token, undefined, { retentionDays: 30 });
};

export const isPrimaryWorkspace = async (projectId: string) => {
  const result = await pgPool.query<{ account_id: string | null }>(
    `SELECT account_id FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  const accountId = result.rows[0]?.account_id ?? null;
  if (!accountId) {
    return false;
  }

  const primaryResult = await pgPool.query<{ id: string }>(
    `
      SELECT id
      FROM projects
      WHERE account_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [accountId],
  );

  return primaryResult.rows[0]?.id === projectId;
};

// Returns the effective retention window in days for a project,
// honouring the plan subscription if the project belongs to an account.
const getProjectRetentionDays = async (projectId: string): Promise<number> => {
  const accountId = await getProjectAccountId(projectId);
  if (!accountId) {
    // Self-hosted / no account — use the stored value directly.
    const result = await pgPool.query<{ retention_days: number }>(
      `SELECT retention_days FROM projects WHERE id = $1 LIMIT 1`,
      [projectId],
    );
    return Number(result.rows[0]?.retention_days ?? 14);
  }

  const subscription = await getCurrentSubscriptionForAccount(accountId);
  const planKey =
    subscription && isActiveSubscriptionStatus(subscription.status)
      ? subscription.plan_key
      : "free";
  return getCloudPlanForKey(planKey).retentionDays;
};

export const deleteProject = async (projectId: string) => {
  // Delete ClickHouse spans first — these live outside Postgres and must be
  // cleaned up explicitly. This is best-effort; Postgres deletion still proceeds
  // even if the ClickHouse mutation fails.
  await queryClickHouse(
    `ALTER TABLE rifft.spans DELETE WHERE project_id = '${escapeValue(projectId)}'`,
  ).catch(() => undefined);

  // Explicit trace deletion in case the traces table does not yet have
  // ON DELETE CASCADE wired to projects(id). Fork drafts and trace_baselines
  // do have cascade from traces, so they are covered.
  await pgPool.query(`DELETE FROM traces WHERE project_id = $1`, [projectId]);

  // api_keys, project_memberships, and pending_project_invites all have
  // ON DELETE CASCADE on projects(id) and are removed automatically.
  await pgPool.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
};

export const getTraceProjectId = async (traceId: string) => {
  const result = await pgPool.query(
    `
      SELECT project_id
      FROM traces
      WHERE trace_id = $1
      LIMIT 1
    `,
    [traceId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0]?.project_id as string;
};

export const updateProjectSettings = async (
  projectId: string,
  updates: {
    retention_days?: number;
    cost_threshold_usd?: number;
    timeout_threshold_ms?: number;
  },
) => {
  await ensureApiKeysTable();

  const accountId = await getProjectAccountId(projectId);
  const subscription = accountId ? await getCurrentSubscriptionForAccount(accountId) : null;
  const enforcedPlanKey =
    subscription && isActiveSubscriptionStatus(subscription.status) ? subscription.plan_key : "free";
  const enforcedRetentionDays = accountId ? getCloudPlanForKey(enforcedPlanKey).retentionDays : null;

  const assignments: string[] = [];
  const params: unknown[] = [projectId];
  let paramIndex = 2;

  if (updates.retention_days !== undefined && !accountId) {
    assignments.push(`retention_days = $${paramIndex}`);
    params.push(updates.retention_days);
    paramIndex += 1;
  }

  if (updates.cost_threshold_usd !== undefined) {
    assignments.push(`cost_threshold_usd = $${paramIndex}`);
    params.push(updates.cost_threshold_usd);
    paramIndex += 1;
  }

  if (updates.timeout_threshold_ms !== undefined) {
    assignments.push(`timeout_threshold_ms = $${paramIndex}`);
    params.push(updates.timeout_threshold_ms);
    paramIndex += 1;
  }

  if (accountId && enforcedRetentionDays !== null) {
    assignments.push(`retention_days = $${paramIndex}`);
    params.push(enforcedRetentionDays);
    paramIndex += 1;
  }

  if (assignments.length === 0) {
    return getProject(projectId);
  }

  const result = await pgPool.query(
    `
      UPDATE projects
      SET ${assignments.join(", ")},
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, account_id, retention_days, cost_threshold_usd, timeout_threshold_ms, created_at, updated_at
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  const apiKey = await ensurePrimaryApiKeyForProject(projectId);
  return {
    ...toProjectRecord(result.rows[0], apiKey.token, undefined, { retentionDays: 30 }),
    retention_overridden_by_plan:
      Boolean(accountId) &&
      updates.retention_days !== undefined &&
      enforcedRetentionDays !== null &&
      updates.retention_days !== enforcedRetentionDays,
  };
};

export const regenerateProjectApiKey = async (projectId: string) => {
  await ensureApiKeysTable();

  await pgPool.query(
    `
      UPDATE api_keys
      SET revoked_at = NOW()
      WHERE project_id = $1
        AND revoked_at IS NULL
    `,
    [projectId],
  );

  const token = toApiKeyToken();
  await pgPool.query(
    `
      INSERT INTO api_keys (id, project_id, name, token)
      VALUES ($1, $2, 'default', $3)
    `,
    [`key_${randomBytes(12).toString("hex")}`, projectId, token],
  );

  return getProject(projectId);
};

export const getCloudProjectUsageSummary = async (projectId: string) => {
  const project = await getProject(projectId);
  if (!project) {
    return null;
  }

  const accountId = await getProjectAccountId(projectId);
  const subscription = accountId ? await getCurrentSubscriptionForAccount(accountId) : null;
  const activePlanKey =
    subscription && isActiveSubscriptionStatus(subscription.status) ? subscription.plan_key : "free";
  const plan = getCloudPlanForKey(activePlanKey);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);

  const usageRows = await queryClickHouse<UsageCountRow>(
    `
      SELECT COUNT(*) AS total
      FROM rifft.spans
      WHERE project_id = '${escapeValue(projectId)}'
        AND start_time >= toDateTime('${monthStart.toISOString().slice(0, 19).replace("T", " ")}')
        AND start_time < toDateTime('${nextMonthStart.toISOString().slice(0, 19).replace("T", " ")}')
    `,
  );

  const usedSpans = Number(usageRows[0]?.total ?? 0);
  const includedSpans = plan.monthlySpanLimit;
  const usageRatio = includedSpans > 0 ? Math.min(usedSpans / includedSpans, 1) : 0;

  return {
    plan: {
      key: plan.key,
      name: plan.name,
      retention_days: plan.retentionDays,
      monthly_span_limit: includedSpans,
      overage_price_per_100k_usd: plan.overagePricePer100kUsd,
      support: plan.support,
      subscription_status: subscription?.status ?? "free",
      current_period_end: subscription?.current_period_end ?? null,
      cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
      account_id: accountId,
      provider_subscription_id: subscription?.provider_subscription_id ?? null,
      last_synced_at: subscription?.updated_at ?? null,
    },
    usage: {
      used_spans: usedSpans,
      included_spans: includedSpans,
      usage_ratio: usageRatio,
      period_start: monthStart.toISOString(),
      period_end: nextMonthStart.toISOString(),
      over_limit: usedSpans > includedSpans,
    },
  };
};

const toProjectAlertChannelSettings = ({
  configured,
  target,
  deliveries,
}: {
  configured: boolean;
  target: string | null;
  deliveries: ProjectAlertDeliveryRecord[];
}): ProjectAlertChannelSettings => {
  const latestTest = deliveries.find((delivery) => delivery.event_type === "test") ?? null;
  const latestAlert = deliveries.find(
    (delivery) => delivery.event_type === "fatal_failure" && delivery.status === "sent",
  ) ?? null;
  const latestFailure = deliveries.find((delivery) => delivery.status === "failed") ?? null;

  return {
    configured,
    target,
    last_tested_at: latestTest?.created_at ?? null,
    last_alert_at: latestAlert?.created_at ?? null,
    last_error: latestFailure?.error ?? null,
  };
};

export const getProjectAlertSettings = async (projectId: string): Promise<ProjectAlertSettings | null> => {
  await ensureProjectAlerts();

  const [projectResult, deliveriesResult, planKey] = await Promise.all([
    pgPool.query<{
      fatal_failure_alerts_enabled: boolean;
      regression_digest_enabled: boolean;
      slack_webhook_url: string | null;
      alert_email: string | null;
    }>(
      `
        SELECT fatal_failure_alerts_enabled, regression_digest_enabled, slack_webhook_url, alert_email
        FROM projects
        WHERE id = $1
        LIMIT 1
      `,
      [projectId],
    ),
    pgPool.query<{
      id: string;
      channel: string;
      event_type: string;
      status: string;
      trace_id: string | null;
      target_label: string | null;
      error: string | null;
      created_at: string | Date;
    }>(
      `
        SELECT id, channel, event_type, status, trace_id, target_label, error, created_at
        FROM project_alert_deliveries
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [projectId],
    ),
    getCurrentPlanKeyForProject(projectId),
  ]);

  if (projectResult.rowCount === 0 || !projectResult.rows[0]) {
    return null;
  }

  const row = projectResult.rows[0];
  const recentDeliveries: ProjectAlertDeliveryRecord[] = deliveriesResult.rows.map((delivery) => ({
    id: delivery.id,
    project_id: projectId,
    channel: delivery.channel === "email" ? "email" : "slack",
    event_type:
      delivery.event_type === "test"
        ? "test"
        : delivery.event_type === "regression_digest"
          ? "regression_digest"
          : "fatal_failure",
    status: delivery.status === "failed" ? "failed" : "sent",
    trace_id: delivery.trace_id,
    target: delivery.target_label,
    error: delivery.error,
    created_at: toIsoOrNull(delivery.created_at) ?? new Date().toISOString(),
  }));
  const slackDeliveries = recentDeliveries.filter((delivery) => delivery.channel === "slack");
  const emailDeliveries = recentDeliveries.filter((delivery) => delivery.channel === "email");

  return {
    available: planKey === "pro" || planKey === "scale",
    regression_available: planKey === "scale",
    plan_key: planKey,
    fatal_failures_enabled: Boolean(row.fatal_failure_alerts_enabled),
    regression_digest_enabled: Boolean(row.regression_digest_enabled),
    slack: toProjectAlertChannelSettings({
      configured: Boolean(row.slack_webhook_url),
      target: maskSlackWebhookTarget(row.slack_webhook_url),
      deliveries: slackDeliveries,
    }),
    email: toProjectAlertChannelSettings({
      configured: Boolean(row.alert_email),
      target: row.alert_email ?? null,
      deliveries: emailDeliveries,
    }),
    recent_deliveries: recentDeliveries,
  };
};

export const updateProjectAlertSettings = async (
  projectId: string,
  updates: {
    fatal_failures_enabled?: boolean;
    regression_digest_enabled?: boolean;
    slack_webhook_url?: string | null;
    alert_email?: string | null;
  },
) => {
  await ensureProjectAlerts();

  const current = await getProjectAlertSettings(projectId);
  if (!current) {
    return null;
  }

  const nextSlackConfigured =
    updates.slack_webhook_url !== undefined
      ? Boolean(updates.slack_webhook_url)
      : current.slack.configured;
  const nextEmailConfigured =
    updates.alert_email !== undefined
      ? Boolean(updates.alert_email)
      : current.email.configured;
  const nextFatalEnabled =
    updates.fatal_failures_enabled !== undefined
      ? updates.fatal_failures_enabled
      : current.fatal_failures_enabled;

  const nextRegressionEnabled =
    updates.regression_digest_enabled !== undefined
      ? updates.regression_digest_enabled
      : current.regression_digest_enabled;

  if (nextFatalEnabled && !nextSlackConfigured && !nextEmailConfigured) {
    throw new Error("alert_destination_required");
  }
  if (nextRegressionEnabled && !nextSlackConfigured && !nextEmailConfigured) {
    throw new Error("alert_destination_required");
  }

  const assignments: string[] = [];
  const params: unknown[] = [projectId];
  let paramIndex = 2;

  if (updates.fatal_failures_enabled !== undefined) {
    assignments.push(`fatal_failure_alerts_enabled = $${paramIndex}`);
    params.push(updates.fatal_failures_enabled);
    paramIndex += 1;
  }

  if (updates.regression_digest_enabled !== undefined) {
    assignments.push(`regression_digest_enabled = $${paramIndex}`);
    params.push(updates.regression_digest_enabled);
    paramIndex += 1;
  }

  if (updates.slack_webhook_url !== undefined) {
    assignments.push(`slack_webhook_url = $${paramIndex}`);
    params.push(updates.slack_webhook_url);
    paramIndex += 1;
  }

  if (updates.alert_email !== undefined) {
    assignments.push(`alert_email = $${paramIndex}`);
    params.push(updates.alert_email);
    paramIndex += 1;
  }

  if (assignments.length === 0) {
    return current;
  }

  const result = await pgPool.query(
    `
      UPDATE projects
      SET ${assignments.join(", ")},
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  return getProjectAlertSettings(projectId);
};

export const getProjectAlertDeliveryTargets = async (projectId: string) => {
  await ensureProjectAlerts();

  const settings = await getProjectAlertSettings(projectId);
  if (!settings || !settings.available || !settings.fatal_failures_enabled) {
    return null;
  }

  const result = await pgPool.query<{
    slack_webhook_url: string | null;
    alert_email: string | null;
  }>(
    `
      SELECT slack_webhook_url, alert_email
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId],
  );

  if (result.rowCount === 0 || !result.rows[0]) {
    return null;
  }

  return {
    slack_webhook_url: result.rows[0].slack_webhook_url ?? null,
    alert_email: result.rows[0].alert_email ?? null,
  };
};

export const recordProjectAlertDelivery = async ({
  projectId,
  channel,
  eventType,
  status,
  traceId,
  targetLabel,
  error,
}: {
  projectId: string;
  channel: ProjectAlertChannel;
  eventType: ProjectAlertEventType;
  status: ProjectAlertDeliveryStatus;
  traceId?: string | null;
  targetLabel?: string | null;
  error?: string | null;
}) => {
  await ensureProjectAlerts();

  await pgPool.query(
    `
      INSERT INTO project_alert_deliveries (
        id,
        project_id,
        channel,
        event_type,
        status,
        trace_id,
        target_label,
        error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      `alert_${randomBytes(12).toString("hex")}`,
      projectId,
      channel,
      eventType,
      status,
      traceId ?? null,
      targetLabel ?? null,
      error ?? null,
    ],
  );
};

export const getStoredTraceFailureExplanation = async (
  traceId: string,
): Promise<TraceFailureExplanation | null> => {
  await ensureTraceFailureExplanations();

  const result = await pgPool.query<{
    trace_id: string;
    project_id: string;
    summary: string;
    evidence: unknown;
    recommended_fix: string;
    confidence: string;
    model: string;
    generated_at: string | Date;
    updated_at: string | Date;
  }>(
    `
      SELECT trace_id, project_id, summary, evidence, recommended_fix, confidence, model, generated_at, updated_at
      FROM trace_failure_explanations
      WHERE trace_id = $1
      LIMIT 1
    `,
    [traceId],
  );

  if (result.rowCount === 0 || !result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    trace_id: row.trace_id,
    project_id: row.project_id,
    summary: row.summary,
    evidence: Array.isArray(row.evidence)
      ? row.evidence.map((item) => String(item))
      : parseJson<string[]>(JSON.stringify(row.evidence ?? []), []),
    recommended_fix: row.recommended_fix,
    confidence:
      row.confidence === "high" ? "high" : row.confidence === "low" ? "low" : "medium",
    model: row.model,
    generated_at: toIsoOrNull(row.generated_at) ?? new Date().toISOString(),
    updated_at: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
  };
};

export const upsertTraceFailureExplanation = async ({
  traceId,
  projectId,
  summary,
  evidence,
  recommendedFix,
  confidence,
  model,
}: {
  traceId: string;
  projectId: string;
  summary: string;
  evidence: string[];
  recommendedFix: string;
  confidence: "high" | "medium" | "low";
  model: string;
}) => {
  await ensureTraceFailureExplanations();

  await pgPool.query(
    `
      INSERT INTO trace_failure_explanations (
        trace_id,
        project_id,
        summary,
        evidence,
        recommended_fix,
        confidence,
        model
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
      ON CONFLICT (trace_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        summary = EXCLUDED.summary,
        evidence = EXCLUDED.evidence,
        recommended_fix = EXCLUDED.recommended_fix,
        confidence = EXCLUDED.confidence,
        model = EXCLUDED.model,
        updated_at = NOW()
    `,
    [traceId, projectId, summary, JSON.stringify(evidence), recommendedFix, confidence, model],
  );

  return getStoredTraceFailureExplanation(traceId);
};

export const syncStripeSubscription = async (
  eventType: string,
  subscription: {
    id: string;
    customer: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_start?: number | null;
    current_period_end?: number | null;
    metadata: Record<string, string>;
    items: { data: Array<{ price: { metadata: Record<string, string> } }> };
  },
) => {
  await ensureSubscriptionsTable();

  const accountId = subscription.metadata.account_id ?? null;
  if (!accountId) {
    return { synced: false, reason: "missing_account_id" as const };
  }

  const planKey =
    subscription.metadata.plan_key ??
    subscription.items.data[0]?.price.metadata.plan_key ??
    "pro";
  const status = subscription.status;
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : null;
  const toIsoOrNull = (unixSeconds?: number | null) => {
    if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
      return null;
    }

    const iso = new Date(unixSeconds * 1000).toISOString();
    return iso === "Invalid Date" ? null : iso;
  };

  const currentPeriodStart = toIsoOrNull(subscription.current_period_start);
  const currentPeriodEnd = toIsoOrNull(subscription.current_period_end);

  await pgPool.query(
    `
      INSERT INTO subscriptions (
        id,
        account_id,
        provider,
        provider_subscription_id,
        provider_customer_id,
        plan_key,
        status,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        raw_event
      )
      VALUES ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (provider_subscription_id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        provider_customer_id = EXCLUDED.provider_customer_id,
        plan_key = EXCLUDED.plan_key,
        status = EXCLUDED.status,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        raw_event = EXCLUDED.raw_event,
        updated_at = NOW()
    `,
    [
      `sub_${subscription.id}`,
      accountId,
      subscription.id,
      customerId,
      planKey,
      status,
      subscription.cancel_at_period_end,
      currentPeriodStart,
      currentPeriodEnd,
      JSON.stringify({ eventType, subscription }),
    ],
  );

  const isActive = ["active", "trialing"].includes(status);
  const appliedPlan = getCloudPlanForKey(isActive ? planKey : "free");
  await updateAccountProjectRetention(accountId, appliedPlan.retentionDays);

  return {
    synced: true,
    account_id: accountId,
    subscription_id: subscription.id,
    plan_key: appliedPlan.key,
    status,
  };
};

export const listTraces = async (filters: TraceListFilters) => {
  // Enforce retention window so free users only see their 14-day window,
  // pro users their 90-day window, etc.
  const retentionDays = await getProjectRetentionDays(filters.projectId);
  const retentionCutoff = new Date();
  retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);

  const where: string[] = ["project_id = $1", "started_at >= $2"];
  const params: unknown[] = [filters.projectId, retentionCutoff.toISOString()];
  let paramIndex = 3;

  if (filters.status && filters.status !== "all") {
    where.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex += 1;
  }

  if (filters.framework && filters.framework !== "all") {
    where.push(`$${paramIndex} = ANY(framework)`);
    params.push(filters.framework);
    paramIndex += 1;
  }

  if (filters.from) {
    where.push(`started_at >= $${paramIndex}`);
    params.push(filters.from);
    paramIndex += 1;
  }

  if (filters.to) {
    where.push(`started_at <= $${paramIndex}`);
    params.push(filters.to);
    paramIndex += 1;
  }

  const countQuery = `SELECT COUNT(*)::int AS total FROM traces WHERE ${where.join(" AND ")}`;
  const countResult = await pgPool.query(countQuery, params);

  const pageSize = Math.max(1, Math.min(filters.pageSize, 100));
  const offset = (Math.max(filters.page, 1) - 1) * pageSize;

  const tracesQuery = `
    SELECT
      trace_id,
      root_span_name,
      started_at,
      duration_ms,
      status,
      agent_count,
      total_cost_usd,
      mast_failures,
      framework
    FROM traces
    WHERE ${where.join(" AND ")}
    ORDER BY started_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const tracesResult = await pgPool.query(tracesQuery, [...params, pageSize, offset]);

  return {
    total: countResult.rows[0]?.total ?? 0,
    traces: tracesResult.rows.map((row: QueryResultRow) => ({
      trace_id: row.trace_id as string,
      root_span_name: (row.root_span_name as string | null) ?? null,
      started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
      duration_ms: Number(row.duration_ms ?? 0),
      status: row.status as string,
      agent_count: Number(row.agent_count ?? 0),
      total_cost_usd: Number(row.total_cost_usd ?? 0),
      mast_failures: row.mast_failures ?? [],
      framework: row.framework ?? [],
    })),
  };
};

export const getProjectInsights = async (projectId: string, recentTraceLimit = 20) => {
  const limit = Math.max(5, Math.min(recentTraceLimit, 50));
  const result = await pgPool.query(
    `
      SELECT trace_id, started_at, status, mast_failures
      FROM traces
      WHERE project_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `,
    [projectId, limit],
  );

  const traces = result.rows.map((row: QueryResultRow) => {
    const mastFailures = (
      Array.isArray(row.mast_failures)
        ? row.mast_failures
        : parseJson<MastFailure[]>(JSON.stringify(row.mast_failures ?? []), [])
    ).map((failure: MastFailure) => ({
      mode: String(failure.mode),
      severity: failure.severity === "fatal" ? "fatal" : "benign",
      agent_id: failure.agent_id ? String(failure.agent_id) : null,
      explanation: String(failure.explanation),
    }));

    return {
      trace_id: String(row.trace_id),
      started_at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
      status: row.status === "error" ? "error" : row.status === "ok" ? "ok" : "unset",
      mast_failures: mastFailures,
    };
  });

  if (traces.length === 0) {
    return {
      recent_trace_window: 0,
      insights: [] as ProjectInsight[],
    };
  }

  const insightMap = new Map<
    string,
    {
      mode: string;
      severity: "benign" | "fatal";
      recent_trace_window: number;
      affected_trace_ids: Set<string>;
      occurrence_count: number;
      agent_counts: Map<string, number>;
      latest_trace_id: string | null;
      latest_started_at: string | null;
      sample_explanation: string;
      token_pressure: ProjectInsight["token_pressure"];
    }
  >();

  for (const trace of traces) {
    const seenModesInTrace = new Set<string>();

    for (const failure of trace.mast_failures) {
      const existing =
        insightMap.get(failure.mode) ??
        {
          mode: failure.mode,
          severity: "benign" as const,
          recent_trace_window: traces.length,
          affected_trace_ids: new Set<string>(),
          occurrence_count: 0,
          agent_counts: new Map<string, number>(),
          latest_trace_id: null,
          latest_started_at: null,
          sample_explanation: failure.explanation,
          token_pressure: null,
        };

      existing.occurrence_count += 1;
      if (failure.severity === "fatal") {
        existing.severity = "fatal";
      }
      if (!existing.sample_explanation) {
        existing.sample_explanation = failure.explanation;
      }
      if (
        !existing.latest_started_at ||
        new Date(trace.started_at).getTime() > new Date(existing.latest_started_at).getTime()
      ) {
        existing.latest_started_at = trace.started_at;
        existing.latest_trace_id = trace.trace_id;
      }
      if (failure.agent_id) {
        existing.agent_counts.set(failure.agent_id, (existing.agent_counts.get(failure.agent_id) ?? 0) + 1);
      }
      if (!seenModesInTrace.has(failure.mode)) {
        existing.affected_trace_ids.add(trace.trace_id);
        seenModesInTrace.add(failure.mode);
      }

      insightMap.set(failure.mode, existing);
    }
  }

  const contextOverflowInsight = insightMap.get("context_window_overflow");
  if (contextOverflowInsight && contextOverflowInsight.affected_trace_ids.size > 0) {
    const traceIds = [...contextOverflowInsight.affected_trace_ids];
    const inClause = traceIds.map((traceId) => `'${escapeValue(traceId)}'`).join(", ");
    const rows = await queryClickHouse<InsightClickHouseRow>(
      `
        SELECT trace_id, agent_id, attributes
        FROM rifft.spans
        WHERE project_id = '${escapeValue(projectId)}'
          AND trace_id IN (${inClause})
      `,
    ).catch(() => [] as InsightClickHouseRow[]);

    const perTrace = new Map<
      string,
      {
        inputTokens: number[];
        contextLimits: number[];
      }
    >();

    for (const row of rows) {
      if (
        contextOverflowInsight.agent_counts.size > 0 &&
        contextOverflowInsight.agent_counts.has(row.agent_id) === false
      ) {
        continue;
      }

      const attributes = parseJson<Record<string, unknown>>(row.attributes, {});
      const inputTokens =
        toNumber(attributes["llm.input_tokens"]) ??
        toNumber(attributes["prompt_tokens"]) ??
        toNumber(attributes["input_tokens"]);
      const contextLimit =
        toNumber(attributes["context_limit"]) ??
        toNumber(attributes["model_context_limit"]) ??
        toNumber(attributes["llm.context_limit"]);

      if (inputTokens === null && contextLimit === null) {
        continue;
      }

      const existing = perTrace.get(row.trace_id) ?? { inputTokens: [], contextLimits: [] };
      if (inputTokens !== null) {
        existing.inputTokens.push(inputTokens);
      }
      if (contextLimit !== null) {
        existing.contextLimits.push(contextLimit);
      }
      perTrace.set(row.trace_id, existing);
    }

    const maxInputs: number[] = [];
    const maxLimits: number[] = [];
    let nearLimitCount = 0;

    for (const metrics of perTrace.values()) {
      const maxInput = metrics.inputTokens.length > 0 ? Math.max(...metrics.inputTokens) : null;
      const maxLimit = metrics.contextLimits.length > 0 ? Math.max(...metrics.contextLimits) : null;

      if (maxInput !== null) {
        maxInputs.push(maxInput);
      }
      if (maxLimit !== null) {
        maxLimits.push(maxLimit);
      }
      if (maxInput !== null && maxLimit !== null && maxLimit > 0 && maxInput / maxLimit >= 0.85) {
        nearLimitCount += 1;
      }
    }

    contextOverflowInsight.token_pressure =
      maxInputs.length > 0 || maxLimits.length > 0
        ? {
            traces_with_signal: perTrace.size,
            median_input_tokens: median(maxInputs),
            max_input_tokens: maxInputs.length > 0 ? Math.max(...maxInputs) : null,
            median_context_limit: median(maxLimits),
            near_limit_ratio: perTrace.size > 0 ? nearLimitCount / perTrace.size : null,
          }
        : null;
  }

  const insights = [...insightMap.values()]
    .map((insight) => {
      const dominantAgent = [...insight.agent_counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
      return {
        mode: insight.mode,
        severity: insight.severity,
        recent_trace_window: insight.recent_trace_window,
        affected_trace_count: insight.affected_trace_ids.size,
        occurrence_count: insight.occurrence_count,
        share_of_recent_traces:
          insight.recent_trace_window > 0 ? insight.affected_trace_ids.size / insight.recent_trace_window : 0,
        dominant_agent_id: dominantAgent?.[0] ?? null,
        dominant_agent_share:
          dominantAgent && insight.occurrence_count > 0 ? dominantAgent[1] / insight.occurrence_count : null,
        latest_trace_id: insight.latest_trace_id,
        latest_started_at: insight.latest_started_at,
        sample_explanation: insight.sample_explanation,
        token_pressure: insight.token_pressure,
      } satisfies ProjectInsight;
    })
    .sort((left, right) => {
      const leftScore =
        left.affected_trace_count * 10 +
        left.occurrence_count * 3 +
        (left.severity === "fatal" ? 8 : 0) +
        (left.token_pressure?.near_limit_ratio ? left.token_pressure.near_limit_ratio * 5 : 0);
      const rightScore =
        right.affected_trace_count * 10 +
        right.occurrence_count * 3 +
        (right.severity === "fatal" ? 8 : 0) +
        (right.token_pressure?.near_limit_ratio ? right.token_pressure.near_limit_ratio * 5 : 0);

      return rightScore - leftScore;
    });

  return {
    recent_trace_window: traces.length,
    insights,
  };
};

export const getProjectBaseline = async (projectId: string): Promise<TraceBaselineRecord | null> => {
  await ensureTraceBaselinesTable();

  const result = await pgPool.query<QueryResultRow>(
    `
      SELECT
        tb.project_id,
        tb.trace_id,
        tb.label,
        tb.updated_at,
        t.started_at AS trace_started_at,
        t.status AS trace_status
      FROM trace_baselines tb
      JOIN traces t ON t.trace_id = tb.trace_id
      WHERE tb.project_id = $1
      LIMIT 1
    `,
    [projectId],
  );

  if (result.rowCount === 0 || !result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    project_id: String(row.project_id),
    trace_id: String(row.trace_id),
    label: typeof row.label === "string" ? row.label : null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    trace_started_at:
      row.trace_started_at instanceof Date
        ? row.trace_started_at.toISOString()
        : ((row.trace_started_at as string | null) ?? null),
    trace_status:
      row.trace_status === "error" ? "error" : row.trace_status === "ok" ? "ok" : row.trace_status === "unset" ? "unset" : null,
  };
};

export const setProjectBaseline = async (
  projectId: string,
  traceId: string,
  updatedByUserId?: string | null,
) => {
  await ensureTraceBaselinesTable();

  const traceProjectId = await getTraceProjectId(traceId);
  if (!traceProjectId || traceProjectId !== projectId) {
    return null;
  }

  await pgPool.query(
    `
      INSERT INTO trace_baselines (project_id, trace_id, updated_by_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id) DO UPDATE SET
        trace_id = EXCLUDED.trace_id,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
    `,
    [projectId, traceId, updatedByUserId ?? null],
  );

  return getProjectBaseline(projectId);
};

export const getTraceComparison = async (
  traceId: string,
  explicitBaselineTraceId?: string | null,
): Promise<TraceComparisonSummary | null> => {
  const currentTrace = await getTrace(traceId);
  if (!currentTrace) {
    return null;
  }

  const baselineRecord =
    explicitBaselineTraceId && explicitBaselineTraceId !== traceId
      ? {
          project_id: currentTrace.project_id,
          trace_id: explicitBaselineTraceId,
          label: null,
          updated_at: "",
          trace_started_at: null,
          trace_status: null,
        }
      : await getProjectBaseline(currentTrace.project_id);

  if (!baselineRecord || baselineRecord.trace_id === traceId) {
    return null;
  }

  const baselineTrace = await getTrace(baselineRecord.trace_id);
  if (!baselineTrace) {
    return null;
  }

  const currentModes = new Set<string>(
    currentTrace.mast_failures.map((failure: (typeof currentTrace.mast_failures)[number]) => failure.mode),
  );
  const baselineModes = new Set<string>(
    baselineTrace.mast_failures.map((failure: (typeof baselineTrace.mast_failures)[number]) => failure.mode),
  );
  const newModes = [...currentModes].filter((mode: string) => !baselineModes.has(mode));
  const resolvedModes = [...baselineModes].filter((mode: string) => !currentModes.has(mode));
  const persistingModes = [...currentModes].filter((mode: string) => baselineModes.has(mode));

  const baselineFatalFailures = baselineTrace.mast_failures.filter(
    (failure: (typeof baselineTrace.mast_failures)[number]) => failure.severity === "fatal",
  ).length;
  const currentFatalFailures = currentTrace.mast_failures.filter(
    (failure: (typeof currentTrace.mast_failures)[number]) => failure.severity === "fatal",
  ).length;
  const baselineFailureCount = baselineTrace.mast_failures.length;
  const currentFailureCount = currentTrace.mast_failures.length;

  let verdict: TraceComparisonSummary["verdict"] = "changed";
  if (
    baselineTrace.status === currentTrace.status &&
    baselineFailureCount === currentFailureCount &&
    newModes.length === 0 &&
    resolvedModes.length === 0
  ) {
    verdict = "same";
  } else if (
    (baselineTrace.status === "error" && currentTrace.status !== "error") ||
    currentFatalFailures < baselineFatalFailures ||
    currentFailureCount < baselineFailureCount
  ) {
    verdict = "improved";
  } else if (
    (baselineTrace.status !== "error" && currentTrace.status === "error") ||
    currentFatalFailures > baselineFatalFailures ||
    currentFailureCount > baselineFailureCount ||
    newModes.length > 0
  ) {
    verdict = "regressed";
  }

  return {
    baseline: {
      ...baselineRecord,
      trace_started_at: baselineTrace.started_at,
      trace_status:
        baselineTrace.status === "error"
          ? "error"
          : baselineTrace.status === "ok"
            ? "ok"
            : "unset",
    },
    current_trace_id: currentTrace.trace_id,
    verdict,
    deltas: {
      duration_ms: currentTrace.duration_ms - baselineTrace.duration_ms,
      cost_usd: currentTrace.total_cost_usd - baselineTrace.total_cost_usd,
      span_count: currentTrace.span_count - baselineTrace.span_count,
      agent_count: currentTrace.agent_count - baselineTrace.agent_count,
      failure_count: currentFailureCount - baselineFailureCount,
      fatal_failure_count: currentFatalFailures - baselineFatalFailures,
    },
    status_transition: {
      baseline:
        baselineTrace.status === "error" ? "error" : baselineTrace.status === "ok" ? "ok" : "unset",
      current:
        currentTrace.status === "error" ? "error" : currentTrace.status === "ok" ? "ok" : "unset",
    },
    failure_modes: {
      new_modes: newModes,
      resolved_modes: resolvedModes,
      persisting_modes: persistingModes,
    },
    root_cause: {
      baseline: baselineTrace.causal_attribution.root_cause_agent_id,
      current: currentTrace.causal_attribution.root_cause_agent_id,
    },
  };
};

export const getTrace = async (traceId: string) => {
  const traceResult = await pgPool.query(
    `
      SELECT trace_id, project_id, root_span_name, started_at, ended_at, updated_at, duration_ms, status, framework, agent_count, span_count, total_cost_usd, mast_failures
      FROM traces
      WHERE trace_id = $1
    `,
    [traceId],
  );

  if (traceResult.rowCount === 0) {
    return null;
  }

  const spans = await queryClickHouse<SpanRow>(
    `
      SELECT trace_id, span_id, parent_span_id, name, start_time, end_time, duration_ms, status, attributes, events, resource, agent_id, framework, project_id
      FROM rifft.spans
      WHERE trace_id = '${escapeValue(traceId)}'
      ORDER BY start_time ASC
    `,
  );

  const parsedSpans = dedupeByKey(spans.map(parseSpan), (span) => `${span.trace_id}:${span.span_id}`);
  const communicationSpans = parsedSpans
    .map(getCommunicationSpan)
    .filter((span): span is CommunicationSpan => span !== null);
  const executionSpans = parsedSpans.filter((span) => getCommunicationSpan(span) === null);

  const trace = traceResult.rows[0];
  const mastFailures = (
    Array.isArray(trace.mast_failures)
      ? trace.mast_failures
      : parseJson<MastFailure[]>(JSON.stringify(trace.mast_failures ?? []), [])
  ).map((failure: MastFailure) => ({
    mode: String(failure.mode),
    severity: failure.severity === "fatal" ? "fatal" : "benign",
    agent_id: failure.agent_id ? String(failure.agent_id) : null,
    explanation: String(failure.explanation),
  }));
  const causalAttribution = buildCausalAttribution(communicationSpans, mastFailures, executionSpans);
  return {
    trace_id: trace.trace_id as string,
    project_id: trace.project_id as string,
    root_span_name: trace.root_span_name as string | null,
    started_at: trace.started_at instanceof Date ? trace.started_at.toISOString() : trace.started_at,
    ended_at: trace.ended_at instanceof Date ? trace.ended_at.toISOString() : trace.ended_at,
    updated_at: trace.updated_at instanceof Date ? trace.updated_at.toISOString() : trace.updated_at,
    duration_ms: Number(trace.duration_ms ?? 0),
    status: trace.status as string,
    framework: trace.framework ?? [],
    agent_count: Number(trace.agent_count ?? 0),
    span_count: Number(trace.span_count ?? 0),
    total_cost_usd: Number(trace.total_cost_usd ?? 0),
    mast_failures: mastFailures,
    causal_attribution: causalAttribution,
    spans: executionSpans,
    communication_spans: communicationSpans,
  };
};

export const getTraceGraph = async (traceId: string, prefetchedTrace?: HydratedTrace | null) => {
  const trace = prefetchedTrace ?? (await getTrace(traceId));

  if (!trace) {
    return null;
  }
  return buildTraceGraph(trace);
};

export const getTraceTimeline = async (traceId: string, prefetchedTrace?: HydratedTrace | null) => {
  const trace = prefetchedTrace ?? (await getTrace(traceId));

  if (!trace) {
    return null;
  }
  return buildTraceTimeline(trace);
};

export const getAgentDetail = async (traceId: string, agentId: string) => {
  const trace = await getTrace(traceId);

  if (!trace) {
    return null;
  }

  const spans = trace.spans.filter((span) => span.agent_id === agentId);
  if (spans.length === 0) {
    return null;
  }

  const summary = spans.reduce(
    (acc, span) => {
      const attributes = span.attributes as Record<string, unknown>;
      const cost = Number(attributes["cost_usd"] ?? attributes["llm.cost_usd"] ?? 0) || 0;
      acc.total_cost_usd += cost;
      acc.total_duration_ms += Number(span.duration_ms);
      acc.status =
        acc.status === "error" || span.status === "error"
          ? "error"
          : acc.status === "ok" || span.status === "ok"
            ? "ok"
            : "unset";
      return acc;
    },
    {
      agent_id: agentId,
      framework: spans[0]?.framework ?? "custom",
      status: "unset",
      total_cost_usd: 0,
      total_duration_ms: 0,
    },
  );

  const messages = trace.communication_spans
    .filter((span) => span.source_agent_id === agentId || span.target_agent_id === agentId)
    .map((span) => {
      return {
        span_id: span.span_id,
        name: span.name,
        sender: span.source_agent_id,
        receiver: span.target_agent_id,
        timestamp: toIsoTimestamp(span.start_time),
        payload: span.message,
        protocol: span.protocol,
      };
    });

  const toolCalls = spans
    .filter((span) => {
      const attributes = span.attributes as Record<string, unknown>;
      return typeof attributes["tool.name"] === "string" || typeof attributes["mcp.tool_name"] === "string";
    })
    .map((span) => {
      const attributes = span.attributes as Record<string, unknown>;
      return {
        span_id: span.span_id,
        tool_name: attributes["tool.name"] ?? attributes["mcp.tool_name"] ?? "unknown_tool",
        input: attributes["tool.input"] ?? attributes["mcp.input"] ?? null,
        output: attributes["tool.output"] ?? attributes["mcp.output"] ?? null,
        duration_ms: span.duration_ms,
      };
    });

  const decisionContext = [...spans]
    .reverse()
    .map((span) => (span.attributes as Record<string, unknown>)["rifft.decision"])
    .find((value) => value !== undefined) ?? null;

  return {
    summary,
    messages,
    tool_calls: toolCalls,
    mast_failures: trace.mast_failures.filter((failure: MastFailure) => failure.agent_id === agentId),
    decision_context: decisionContext,
  };
};

export const listForkDrafts = async (traceId: string): Promise<ForkDraft[]> => {
  await ensureForkDraftsTable();

  const result = await pgPool.query(
    `
      SELECT trace_id, span_id, payload, created_at, updated_at
      FROM fork_drafts
      WHERE trace_id = $1
      ORDER BY updated_at DESC
    `,
    [traceId],
  );

  return result.rows.map((row: QueryResultRow) => ({
    trace_id: row.trace_id as string,
    span_id: row.span_id as string,
    payload: row.payload,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));
};

export const upsertForkDraft = async (traceId: string, spanId: string, payload: unknown) => {
  await ensureForkDraftsTable();

  const result = await pgPool.query(
    `
      INSERT INTO fork_drafts (trace_id, span_id, payload)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (trace_id, span_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING trace_id, span_id, payload, created_at, updated_at
    `,
    [traceId, spanId, JSON.stringify(payload)],
  );

  const row = result.rows[0];
  return {
    trace_id: row.trace_id as string,
    span_id: row.span_id as string,
    payload: row.payload,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  } satisfies ForkDraft;
};

let pendingInvitesTableEnsured = false;

const ensurePendingInvitesTable = async () => {
  if (pendingInvitesTableEnsured) {
    return;
  }

  await ensureCloudMemberships();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pending_project_invites (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      inviter_user_id TEXT NOT NULL,
      invitee_email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, invitee_email)
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pending_project_invites_email_idx
      ON pending_project_invites (invitee_email)
  `);

  pendingInvitesTableEnsured = true;
};

export const listProjectMembers = async (projectId: string) => {
  await ensureCloudMemberships();
  await ensurePendingInvitesTable();

  const [membersResult, pendingResult] = await Promise.all([
    pgPool.query(
      `
        SELECT user_id, user_email, role
        FROM project_memberships
        WHERE project_id = $1
        ORDER BY role DESC, user_email ASC
      `,
      [projectId],
    ),
    pgPool.query(
      `
        SELECT invitee_email
        FROM pending_project_invites
        WHERE project_id = $1
        ORDER BY created_at ASC
      `,
      [projectId],
    ),
  ]);

  const members = membersResult.rows.map((row: QueryResultRow) => ({
    user_id: row.user_id as string,
    user_email: (row.user_email as string | null) ?? null,
    role: (row.role === "owner" ? "owner" : "member") as "owner" | "member",
    status: "active" as const,
  }));

  const pending = pendingResult.rows.map((row: QueryResultRow) => ({
    user_id: null,
    user_email: row.invitee_email as string,
    role: "member" as const,
    status: "pending" as const,
  }));

  return [...members, ...pending];
};

export const addProjectMember = async (
  projectId: string,
  inviterUserId: string,
  inviteeEmail: string,
) => {
  await ensureCloudMemberships();
  await ensurePendingInvitesTable();

  const accessContext = await getProjectAccessContext(inviterUserId, projectId);
  if (!accessContext?.permissions.can_update_settings) {
    return { ok: false, reason: "forbidden" as const };
  }

  // Block self-invite
  const inviterAccount = await pgPool.query(
    `SELECT owner_email FROM accounts WHERE id = (
      SELECT account_id FROM projects WHERE id = $1 LIMIT 1
    ) LIMIT 1`,
    [projectId],
  );
  const inviterEmail = (inviterAccount.rows[0]?.owner_email as string | null) ?? null;
  if (inviterEmail && inviterEmail.toLowerCase() === inviteeEmail.toLowerCase()) {
    return { ok: false, reason: "cannot_invite_self" as const };
  }

  // Enforce free tier member limit (max 1 additional member)
  const accountId = await getProjectAccountId(projectId);
  if (accountId) {
    const subscription = await getCurrentSubscriptionForAccount(accountId);
    const activePlanKey =
      subscription && isActiveSubscriptionStatus(subscription.status)
        ? subscription.plan_key
        : "free";
    if (activePlanKey === "free") {
      const memberCount = await pgPool.query(
        `SELECT COUNT(*) AS total FROM project_memberships
         WHERE project_id = $1 AND role = 'member'`,
        [projectId],
      );
      const pendingCount = await pgPool.query(
        `SELECT COUNT(*) AS total FROM pending_project_invites
         WHERE project_id = $1`,
        [projectId],
      );
      const totalNonOwners =
        Number(memberCount.rows[0]?.total ?? 0) +
        Number(pendingCount.rows[0]?.total ?? 0);
      if (totalNonOwners >= 1) {
        return { ok: false, reason: "member_limit_reached" as const };
      }
    }
  }

  const existing = await pgPool.query(
    `
      SELECT pm.user_id
      FROM project_memberships pm
      JOIN account_memberships am ON am.user_id = pm.user_id
      WHERE pm.project_id = $1 AND am.user_email = $2
      LIMIT 1
    `,
    [projectId, inviteeEmail],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { ok: false, reason: "already_member" as const };
  }

  const userResult = await pgPool.query(
    `
      SELECT id
      FROM accounts
      WHERE owner_email = $1
      LIMIT 1
    `,
    [inviteeEmail],
  );

  if (userResult.rowCount === 0 || !userResult.rows[0]) {
    await pgPool.query(
      `
        INSERT INTO pending_project_invites (project_id, inviter_user_id, invitee_email)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, invitee_email) DO NOTHING
      `,
      [projectId, inviterUserId, inviteeEmail],
    );

    // Send invite email non-blockingly via Resend.
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@rifft.dev";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rifft.dev";
    const inviteUrl = `${appUrl}/auth?next=${encodeURIComponent("/workspace")}`;
    if (resendApiKey) {
      const projectResult = await pgPool.query<{ name: string }>(
        `SELECT name FROM projects WHERE id = $1 LIMIT 1`,
        [projectId],
      );
      const projectName = projectResult.rows[0]?.name ?? "a Rifft project";
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: inviteeEmail,
          subject: `You've been invited to ${projectName} on Rifft`,
          html: `<p>A teammate invited you to join the <strong>${projectName}</strong> workspace on Rifft.</p><p><a href="${inviteUrl}">Sign up or sign in</a> to accept — your access will be granted automatically.</p>`,
          text: `A teammate invited you to join the ${projectName} workspace on Rifft.\n\nSign up or sign in to accept: ${inviteUrl}`,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            console.error("Resend invite email failed", response.status, errorBody);
          }
        })
        .catch((error) => {
          // Non-fatal: invite row is already saved; email failure is logged separately.
          console.error("Resend invite email request failed", error);
        });
    }

    return { ok: true, reason: "pending" as const };
  }

  const inviteeUserId = userResult.rows[0].id as string;

  await pgPool.query(
    `
      INSERT INTO project_memberships (project_id, user_id, user_email, role)
      VALUES ($1, $2, $3, 'member')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `,
    [projectId, inviteeUserId, inviteeEmail],
  );

  return { ok: true, reason: null };
};

export const consumePendingInvites = async (userId: string, email: string) => {
  await ensurePendingInvitesTable();

  const pending = await pgPool.query(
    `
      SELECT project_id
      FROM pending_project_invites
      WHERE invitee_email = $1
      ORDER BY created_at ASC
    `,
    [email],
  );

  if (pending.rowCount === 0) {
    return null;
  }

  const invitedProjectId = (pending.rows[0]?.project_id as string | undefined) ?? null;

  for (const row of pending.rows) {
    const projectId = row.project_id as string;
    await pgPool.query(
      `
        INSERT INTO project_memberships (project_id, user_id, user_email, role)
        VALUES ($1, $2, $3, 'member')
        ON CONFLICT (project_id, user_id) DO NOTHING
      `,
      [projectId, userId, email],
    );
  }

  await pgPool.query(
    `
      DELETE FROM pending_project_invites
      WHERE invitee_email = $1
    `,
    [email],
  );

  return invitedProjectId;
};

export const removeProjectMember = async (
  projectId: string,
  removerUserId: string,
  targetUserId: string,
) => {
  await ensureCloudMemberships();

  const accessContext = await getProjectAccessContext(removerUserId, projectId);
  if (!accessContext?.permissions.can_update_settings) {
    return { ok: false, reason: "forbidden" as const };
  }

  const targetContext = await getProjectAccessContext(targetUserId, projectId);
  if (targetContext?.projectRole === "owner" || targetContext?.accountRole === "owner") {
    return { ok: false, reason: "cannot_remove_owner" as const };
  }

  const removalResult = await pgPool.query(
    `
      DELETE FROM project_memberships
      WHERE project_id = $1 AND user_id = $2
      RETURNING user_id
    `,
    [projectId, targetUserId],
  );

  if (removalResult.rowCount === 0) {
    return { ok: false, reason: "member_not_found" as const };
  }

  return { ok: true, reason: null };
};

export const getAlertCandidatesForTrace = async (traceId: string) => {
  const trace = await getTrace(traceId);
  if (!trace) {
    return null;
  }

  const fatalFailures = trace.mast_failures.filter(
    (f: { severity: string }) => f.severity === "fatal",
  );

  if (fatalFailures.length === 0) {
    return null;
  }

  const project = await getProject(trace.project_id);
  if (!project?.account_id) {
    return null;
  }

  const accountResult = await pgPool.query(
    `
      SELECT owner_email
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
    [project.account_id],
  );

  const ownerEmail = (accountResult.rows[0]?.owner_email as string | null) ?? null;

  return {
    trace_id: traceId,
    project_id: trace.project_id,
    project_name: project.name,
    owner_email: ownerEmail,
    fatal_failures: fatalFailures,
    started_at: trace.started_at,
    total_cost_usd: trace.total_cost_usd,
  };
};

// ─── Regression detection ─────────────────────────────────────────────────────

export type RegressionCandidate = {
  mode: string;
  severity: "fatal" | "benign";
  recent_affected_count: number;
  recent_rate: number;
  historical_rate: number;
  rate_delta: number;
  sample_trace_id: string | null;
  sample_explanation: string;
  dominant_agent_id: string | null;
  recent_window_size: number;
  historical_window_size: number;
};

export const detectRegressions = async (projectId: string): Promise<RegressionCandidate[]> => {
  const now = new Date();
  const cutoffRecent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoffHistorical = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const result = await pgPool.query<{
    trace_id: string;
    started_at: Date | string;
    mast_failures: unknown;
  }>(
    `
      SELECT trace_id, started_at, mast_failures
      FROM traces
      WHERE project_id = $1
        AND started_at >= $2
      ORDER BY started_at DESC
    `,
    [projectId, cutoffHistorical.toISOString()],
  );

  const allTraces = result.rows.map((row) => ({
    trace_id: String(row.trace_id),
    started_at: row.started_at instanceof Date ? row.started_at : new Date(row.started_at),
    mast_failures: (
      Array.isArray(row.mast_failures)
        ? row.mast_failures
        : parseJson<MastFailure[]>(JSON.stringify(row.mast_failures ?? []), [])
    ).map((f: MastFailure) => ({
      mode: String(f.mode),
      severity: f.severity === "fatal" ? "fatal" : ("benign" as const),
      agent_id: f.agent_id ? String(f.agent_id) : null,
      explanation: String(f.explanation),
    })),
  }));

  const recentTraces = allTraces.filter((t) => t.started_at >= cutoffRecent);
  const historicalTraces = allTraces.filter((t) => t.started_at < cutoffRecent);

  if (recentTraces.length === 0) {
    return [];
  }

  type ModeEntry = {
    mode: string;
    severity: "fatal" | "benign";
    recent_affected: Set<string>;
    historical_affected: Set<string>;
    agent_counts: Map<string, number>;
    sample_explanation: string;
    sample_trace_id: string | null;
  };

  const modeMap = new Map<string, ModeEntry>();

  const processTraces = (traces: typeof allTraces, window: "recent" | "historical") => {
    for (const trace of traces) {
      const seenModes = new Set<string>();
      for (const failure of trace.mast_failures) {
        const entry: ModeEntry = modeMap.get(failure.mode) ?? {
          mode: failure.mode,
          severity: "benign",
          recent_affected: new Set(),
          historical_affected: new Set(),
          agent_counts: new Map(),
          sample_explanation: failure.explanation,
          sample_trace_id: null,
        };

        if (failure.severity === "fatal") {
          entry.severity = "fatal";
        }
        if (!seenModes.has(failure.mode)) {
          if (window === "recent") {
            entry.recent_affected.add(trace.trace_id);
            if (!entry.sample_trace_id) {
              entry.sample_trace_id = trace.trace_id;
            }
          } else {
            entry.historical_affected.add(trace.trace_id);
          }
          seenModes.add(failure.mode);
        }
        if (failure.agent_id) {
          entry.agent_counts.set(failure.agent_id, (entry.agent_counts.get(failure.agent_id) ?? 0) + 1);
        }
        if (!entry.sample_explanation) {
          entry.sample_explanation = failure.explanation;
        }

        modeMap.set(failure.mode, entry);
      }
    }
  };

  processTraces(historicalTraces, "historical");
  processTraces(recentTraces, "recent");

  const candidates: RegressionCandidate[] = [];

  for (const entry of modeMap.values()) {
    if (entry.recent_affected.size === 0) {
      continue;
    }

    const recentRate = entry.recent_affected.size / recentTraces.length;
    const historicalRate =
      historicalTraces.length > 0 ? entry.historical_affected.size / historicalTraces.length : 0;
    const delta = recentRate - historicalRate;

    // Surface the mode if it's newly appearing or has risen by ≥10pp
    if (historicalRate === 0 || delta >= 0.1) {
      const dominantAgent = [...entry.agent_counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      candidates.push({
        mode: entry.mode,
        severity: entry.severity,
        recent_affected_count: entry.recent_affected.size,
        recent_rate: recentRate,
        historical_rate: historicalRate,
        rate_delta: delta,
        sample_trace_id: entry.sample_trace_id,
        sample_explanation: entry.sample_explanation,
        dominant_agent_id: dominantAgent,
        recent_window_size: recentTraces.length,
        historical_window_size: historicalTraces.length,
      });
    }
  }

  // Sort: newly appearing first (historical_rate === 0), then by largest delta
  return candidates.sort((a, b) => {
    if (a.historical_rate === 0 && b.historical_rate > 0) return -1;
    if (b.historical_rate === 0 && a.historical_rate > 0) return 1;
    return b.rate_delta - a.rate_delta;
  });
};

// ─── Incident shares ──────────────────────────────────────────────────────────

const ensureIncidentSharesTable = async () => {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS incident_shares (
      token TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS incident_shares_trace_id_idx ON incident_shares (trace_id);
  `);
};

export const createIncidentShare = async (
  traceId: string,
  projectId: string,
  userId: string | null,
): Promise<string> => {
  await ensureIncidentSharesTable();

  // Return existing token if the trace already has a share link
  const existing = await pgPool.query<{ token: string }>(
    `SELECT token FROM incident_shares WHERE trace_id = $1 LIMIT 1`,
    [traceId],
  );
  if ((existing.rowCount ?? 0) > 0 && existing.rows[0]) {
    return existing.rows[0].token;
  }

  const token = randomBytes(16).toString("hex");
  await pgPool.query(
    `INSERT INTO incident_shares (token, trace_id, project_id, created_by_user_id) VALUES ($1, $2, $3, $4)`,
    [token, traceId, projectId, userId],
  );
  return token;
};

// ─── Cost and latency optimisation suggestions (Scale plan) ──────────────────

export type OptimizationSuggestionType =
  | "cost_dominant_agent"
  | "latency_bottleneck"
  | "model_downgrade";

export type OptimizationSuggestion = {
  /** Stable ID — safe to use as a React key */
  id: string;
  type: OptimizationSuggestionType;
  severity: "high" | "medium";
  title: string;
  explanation: string;
  /** Human-readable estimate, e.g. "~40% reduction in total project cost" */
  estimated_saving: string | null;
  /** The primary agent this suggestion is about, if applicable */
  agent_id: string | null;
  traces_analyzed: number;
};

export type OptimizationSuggestionsResult = {
  suggestions: OptimizationSuggestion[];
  traces_analyzed: number;
  days_analyzed: number;
};

type AgentAggRow = {
  agent_id: string;
  span_count: string;
  total_cost_usd: string;
  total_duration_ms: string;
  total_input_tokens: string;
  total_output_tokens: string;
};

export const getOptimizationSuggestions = async (
  projectId: string,
): Promise<OptimizationSuggestionsResult> => {
  const windowDays = 30;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const fmtDateTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

  // Trace count from Postgres (authoritative for what the user has seen)
  const traceResult = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM traces WHERE project_id = $1 AND started_at >= $2`,
    [projectId, cutoff.toISOString()],
  );
  const traceCount = Number(traceResult.rows[0]?.count ?? 0);

  if (traceCount < 3) {
    return { suggestions: [], traces_analyzed: traceCount, days_analyzed: windowDays };
  }

  // Per-agent aggregates from ClickHouse.
  // cost_usd and llm.cost_usd are mutually exclusive per span (only one will be non-zero),
  // so summing both is safe. Same for the token variants.
  const agentRows = await queryClickHouse<AgentAggRow>(
    `
    SELECT
      agent_id,
      COUNT(*)                                                            AS span_count,
      SUM(duration_ms)                                                    AS total_duration_ms,
      SUM(
        simpleJSONExtractFloat(attributes, 'cost_usd') +
        simpleJSONExtractFloat(attributes, 'llm.cost_usd')
      )                                                                   AS total_cost_usd,
      SUM(
        simpleJSONExtractUInt(attributes, 'llm.input_tokens') +
        simpleJSONExtractUInt(attributes, 'prompt_tokens')  +
        simpleJSONExtractUInt(attributes, 'input_tokens')
      )                                                                   AS total_input_tokens,
      SUM(
        simpleJSONExtractUInt(attributes, 'llm.output_tokens') +
        simpleJSONExtractUInt(attributes, 'completion_tokens') +
        simpleJSONExtractUInt(attributes, 'output_tokens')
      )                                                                   AS total_output_tokens
    FROM rifft.spans
    WHERE project_id = '${escapeValue(projectId)}'
      AND agent_id != ''
      AND start_time >= toDateTime('${fmtDateTime(cutoff)}')
    GROUP BY agent_id
    HAVING total_cost_usd > 0 OR total_duration_ms > 0
    ORDER BY total_cost_usd DESC
    `,
  ).catch(() => [] as AgentAggRow[]);

  if (agentRows.length === 0) {
    return { suggestions: [], traces_analyzed: traceCount, days_analyzed: windowDays };
  }

  const totalCost = agentRows.reduce((s, r) => s + Number(r.total_cost_usd), 0);
  const totalDuration = agentRows.reduce((s, r) => s + Number(r.total_duration_ms), 0);

  const pct = (n: number, total: number) =>
    total > 0 ? Math.round((n / total) * 100) : 0;
  const fmtCost = (usd: number) =>
    usd < 0.001 ? `$${(usd * 1000).toFixed(2)}m` : `$${usd.toFixed(3)}`;
  const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const suggestions: OptimizationSuggestion[] = [];

  // ── 1. Cost-dominant agent ─────────────────────────────────────────────────
  if (totalCost > 0) {
    const top = agentRows[0];
    if (top) {
      const share = pct(Number(top.total_cost_usd), totalCost);

      if (share >= 50) {
        const inputTok = Number(top.total_input_tokens);
        const outputTok = Number(top.total_output_tokens);
        const outputRatio = inputTok > 50 ? outputTok / inputTok : null;
        const costStr = fmtCost(Number(top.total_cost_usd));

        let explanation =
          `The ${top.agent_id} agent accounts for ${share}% of total LLM cost across ` +
          `the last ${traceCount} traces (${costStr} total).`;

        let estimatedSaving: string | null = null;

        if (outputRatio !== null && outputRatio > 2.0) {
          explanation +=
            ` Its output-to-input token ratio is ${outputRatio.toFixed(1)}x — it generates ` +
            `significantly more than it reads. Generation-heavy agents are strong candidates for ` +
            `a smaller, faster model on their drafting step, where the quality difference is ` +
            `often negligible. Switching the draft step alone could reduce this agent's cost by 60–80%.`;
          estimatedSaving = `~${Math.round(share * 0.55)}% reduction in total project cost`;
        } else {
          explanation +=
            ` Review whether this agent's task justifies a frontier model, or whether a ` +
            `smaller model with a tighter prompt could deliver the same output.`;
          estimatedSaving = `~${Math.round(share * 0.4)}% reduction in total project cost`;
        }

        suggestions.push({
          id: `cost_dominant_agent:${top.agent_id}`,
          type: "cost_dominant_agent",
          severity: share >= 70 ? "high" : "medium",
          title: `${top.agent_id} accounts for ${share}% of total cost`,
          explanation,
          estimated_saving: estimatedSaving,
          agent_id: top.agent_id,
          traces_analyzed: traceCount,
        });
      }
    }
  }

  // ── 2. Latency bottleneck ──────────────────────────────────────────────────
  if (totalDuration > 0) {
    const byDuration = [...agentRows].sort(
      (a, b) => Number(b.total_duration_ms) - Number(a.total_duration_ms),
    );
    const top = byDuration[0];
    if (top) {
      const share = pct(Number(top.total_duration_ms), totalDuration);

      if (share >= 60) {
        const avgMs = Math.round(Number(top.total_duration_ms) / Number(top.span_count));
        suggestions.push({
          id: `latency_bottleneck:${top.agent_id}`,
          type: "latency_bottleneck",
          severity: share >= 75 ? "high" : "medium",
          title: `${top.agent_id} accounts for ${share}% of total trace time`,
          explanation:
            `The ${top.agent_id} agent accounts for ${share}% of total trace duration across ` +
            `the last ${traceCount} traces, averaging ${fmtSec(avgMs)} per call. ` +
            `If downstream agents don't depend on its full output, moving work out of this ` +
            `agent's critical path — or parallelising independent steps — could substantially ` +
            `reduce end-to-end latency.`,
          estimated_saving: null,
          agent_id: top.agent_id,
          traces_analyzed: traceCount,
        });
      }
    }
  }

  // ── 3. Model-downgrade candidate (high output ratio, not already flagged) ──
  const flaggedAgents = new Set(suggestions.map((s) => s.agent_id).filter(Boolean));

  for (const row of agentRows.slice(0, 6)) {
    if (flaggedAgents.has(row.agent_id)) continue;

    const inputTok = Number(row.total_input_tokens);
    const outputTok = Number(row.total_output_tokens);
    if (inputTok < 100) continue; // not enough LLM signal

    const ratio = outputTok / inputTok;
    const share = pct(Number(row.total_cost_usd), totalCost);

    if (ratio >= 3.0 && share >= 15) {
      suggestions.push({
        id: `model_downgrade:${row.agent_id}`,
        type: "model_downgrade",
        severity: "medium",
        title: `${row.agent_id} has a ${ratio.toFixed(1)}x output-to-input ratio`,
        explanation:
          `The ${row.agent_id} agent generates ${ratio.toFixed(1)} tokens of output for every ` +
          `token of input (${share}% of total project cost). ` +
          `Generation-heavy agents are typically good candidates for a smaller, faster model on ` +
          `their drafting step — quality differences for long-form generation are often negligible ` +
          `while cost differences can be 60–80%.`,
        estimated_saving: `~${Math.round(share * 0.6)}% reduction in total project cost`,
        agent_id: row.agent_id,
        traces_analyzed: traceCount,
      });
      break; // one model-downgrade suggestion is enough
    }
  }

  return {
    suggestions: suggestions.slice(0, 4),
    traces_analyzed: traceCount,
    days_analyzed: windowDays,
  };
};

// ─── Weekly digest ───────────────────────────────────────────────────────────

export type WeeklyDigestStats = {
  /** Spans ingested in the last 7 days */
  spans_this_week: number;
  /** Spans ingested in the 7 days before that */
  spans_last_week: number;
  /** Traces started in the last 7 days */
  traces_this_week: number;
  /** Traces with at least one fatal MAST failure in the last 7 days */
  fatal_traces_this_week: number;
  /** Top agents by span count this week (up to 5) */
  top_agents: Array<{ agent_id: string; span_count: number; avg_duration_ms: number }>;
  /** MAST failure mode breakdown for the last 7 days */
  mast_breakdown: Array<{ mode: string; severity: "fatal" | "benign"; affected_traces: number }>;
  /** The trace_id of the most recent fatal trace, for a direct CTA link */
  worst_trace_id: string | null;
};

export const getWeeklyDigestStats = async (projectId: string): Promise<WeeklyDigestStats> => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const fmtDateTime = (d: Date) =>
    d.toISOString().slice(0, 19).replace("T", " ");

  // Span counts: this week and last week — both from ClickHouse
  const [spansThisWeekRows, spansLastWeekRows, topAgentsRows] = await Promise.all([
    queryClickHouse<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM rifft.spans
        WHERE project_id = '${escapeValue(projectId)}'
          AND start_time >= toDateTime('${fmtDateTime(weekAgo)}')
      `,
    ).catch(() => [] as { total: string }[]),

    queryClickHouse<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM rifft.spans
        WHERE project_id = '${escapeValue(projectId)}'
          AND start_time >= toDateTime('${fmtDateTime(twoWeeksAgo)}')
          AND start_time < toDateTime('${fmtDateTime(weekAgo)}')
      `,
    ).catch(() => [] as { total: string }[]),

    queryClickHouse<{ agent_id: string; span_count: string; avg_duration_ms: string }>(
      `
        SELECT
          agent_id,
          COUNT(*) AS span_count,
          AVG(duration_ms) AS avg_duration_ms
        FROM rifft.spans
        WHERE project_id = '${escapeValue(projectId)}'
          AND agent_id != ''
          AND start_time >= toDateTime('${fmtDateTime(weekAgo)}')
        GROUP BY agent_id
        ORDER BY span_count DESC
        LIMIT 5
      `,
    ).catch(() => [] as { agent_id: string; span_count: string; avg_duration_ms: string }[]),
  ]);

  // Trace-level stats from Postgres
  const traceResult = await pgPool.query<{
    trace_id: string;
    mast_failures: unknown;
    has_fatal: boolean;
  }>(
    `
      SELECT
        trace_id,
        mast_failures,
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(mast_failures::jsonb) = 'array'
              THEN mast_failures::jsonb
              ELSE '[]'::jsonb
            END
          ) AS f
          WHERE (f->>'severity') = 'fatal'
        ) AS has_fatal
      FROM traces
      WHERE project_id = $1
        AND started_at >= $2
      ORDER BY started_at DESC
    `,
    [projectId, weekAgo.toISOString()],
  );

  const traceRows = traceResult.rows;
  const fatalTraces = traceRows.filter((r) => r.has_fatal);

  // Build MAST breakdown
  const modeMap = new Map<string, { severity: "fatal" | "benign"; affected: Set<string> }>();
  for (const row of traceRows) {
    const failures = (
      Array.isArray(row.mast_failures)
        ? row.mast_failures
        : parseJson<MastFailure[]>(JSON.stringify(row.mast_failures ?? []), [])
    ) as MastFailure[];

    const seenInTrace = new Set<string>();
    for (const f of failures) {
      if (seenInTrace.has(f.mode)) continue;
      seenInTrace.add(f.mode);
      const existing = modeMap.get(f.mode) ?? { severity: "benign", affected: new Set() };
      if (f.severity === "fatal") existing.severity = "fatal";
      existing.affected.add(row.trace_id);
      modeMap.set(f.mode, existing);
    }
  }

  const mastBreakdown = [...modeMap.entries()]
    .sort((a, b) => b[1].affected.size - a[1].affected.size)
    .slice(0, 6)
    .map(([mode, entry]) => ({
      mode,
      severity: entry.severity,
      affected_traces: entry.affected.size,
    }));

  return {
    spans_this_week: Number(spansThisWeekRows[0]?.total ?? 0),
    spans_last_week: Number(spansLastWeekRows[0]?.total ?? 0),
    traces_this_week: traceRows.length,
    fatal_traces_this_week: fatalTraces.length,
    top_agents: topAgentsRows.map((r) => ({
      agent_id: r.agent_id,
      span_count: Number(r.span_count),
      avg_duration_ms: Math.round(Number(r.avg_duration_ms)),
    })),
    mast_breakdown: mastBreakdown,
    worst_trace_id: fatalTraces[0]?.trace_id ?? traceRows[0]?.trace_id ?? null,
  };
};

export const getScaleProjectsWithDigestEnabled = async (): Promise<
  Array<{ project_id: string; name: string; alert_email: string | null; slack_webhook_url: string | null }>
> => {
  const result = await pgPool.query<{
    project_id: string;
    name: string;
    alert_email: string | null;
    slack_webhook_url: string | null;
  }>(
    `
      SELECT
        p.id AS project_id,
        p.name,
        p.alert_email,
        p.slack_webhook_url
      FROM projects p
      JOIN accounts a ON a.id = p.account_id
      JOIN subscriptions s ON s.account_id = a.id
      WHERE p.regression_digest_enabled = TRUE
        AND s.plan_key = 'scale'
        AND s.status IN ('active', 'trialing')
      ORDER BY p.id
    `,
  );
  return result.rows;
};

export const getIncidentShareByToken = async (
  token: string,
): Promise<{ token: string; trace_id: string; project_id: string; created_at: string } | null> => {
  await ensureIncidentSharesTable();

  const result = await pgPool.query<{
    token: string;
    trace_id: string;
    project_id: string;
    created_at: Date;
  }>(
    `SELECT token, trace_id, project_id, created_at FROM incident_shares WHERE token = $1 LIMIT 1`,
    [token],
  );

  if ((result.rowCount ?? 0) === 0 || !result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    token: row.token,
    trace_id: row.trace_id,
    project_id: row.project_id,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
};
