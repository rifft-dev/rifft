import { randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { queryClickHouse, pgPool } from "./db.js";

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

let forkDraftsTableEnsured = false;

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

  while (true) {
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
  const result = await pgPool.query(
    `
      SELECT id, name, api_key, retention_days, cost_threshold_usd, timeout_threshold_ms, created_at, updated_at
      FROM projects
      WHERE id = $1
    `,
    [projectId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    api_key: row.api_key as string,
    retention_days: Number(row.retention_days ?? 30),
    cost_threshold_usd: Number(row.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(row.timeout_threshold_ms ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
};

export const createProject = async (name: string) => {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `project-${Date.now()}`;
  const apiKey = randomBytes(24).toString("hex");

  const result = await pgPool.query(
    `
      INSERT INTO projects (id, name, api_key)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id, name, api_key, retention_days, created_at
    `,
    [id, name, apiKey],
  );

  return result.rows[0];
};

export const updateProjectSettings = async (
  projectId: string,
  updates: {
    retention_days?: number;
    cost_threshold_usd?: number;
    timeout_threshold_ms?: number;
  },
) => {
  const assignments: string[] = [];
  const params: unknown[] = [projectId];
  let paramIndex = 2;

  if (updates.retention_days !== undefined) {
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

  if (assignments.length === 0) {
    return getProject(projectId);
  }

  const result = await pgPool.query(
    `
      UPDATE projects
      SET ${assignments.join(", ")},
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, api_key, retention_days, cost_threshold_usd, timeout_threshold_ms, created_at, updated_at
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    api_key: row.api_key as string,
    retention_days: Number(row.retention_days ?? 30),
    cost_threshold_usd: Number(row.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(row.timeout_threshold_ms ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
};

export const listTraces = async (filters: TraceListFilters) => {
  const where: string[] = ["project_id = $1"];
  const params: unknown[] = [filters.projectId];
  let paramIndex = 2;

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

export const getTrace = async (traceId: string) => {
  const traceResult = await pgPool.query(
    `
      SELECT trace_id, project_id, root_span_name, started_at, ended_at, duration_ms, status, framework, agent_count, span_count, total_cost_usd, mast_failures
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

export const getTraceGraph = async (traceId: string) => {
  const trace = await getTrace(traceId);

  if (!trace) {
    return null;
  }

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

export const getTraceTimeline = async (traceId: string) => {
  const trace = await getTrace(traceId);

  if (!trace) {
    return null;
  }

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
