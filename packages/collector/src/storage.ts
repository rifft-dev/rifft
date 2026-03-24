import { Pool } from "pg";

type SpanRecord = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  attributes: string;
  events: string;
  resource: string;
  agent_id: string;
  framework: string;
  project_id: string;
};

type TraceSummary = {
  traceId: string;
  projectId: string;
  rootSpanName: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "ok" | "error" | "unset";
  frameworks: string[];
  agentCount: number;
  spanCount: number;
  totalCostUsd: number;
};

const databaseUrl = process.env.DATABASE_URL;
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const clickhouseUser = process.env.CLICKHOUSE_USER ?? "default";
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set");
}

export const pgPool = new Pool({
  connectionString: databaseUrl,
});

const escapeClickHouseString = (value: string) =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const toClickHouseDateTime64 = (value: string) => {
  const [datePart, timePartWithZone = "00:00:00.000Z"] = value.split("T");
  const timePart = timePartWithZone.replace("Z", "");
  const [clock = "00:00:00", fraction = ""] = timePart.split(".");
  const paddedFraction = `${fraction}000000000`.slice(0, 9);
  return `${datePart} ${clock}.${paddedFraction}`;
};

const toClickHouseValue = (value: string | number | null) => {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? `${value}` : "0";
  }

  return escapeClickHouseString(value);
};

const executeClickHouseQuery = async (query: string) => {
  const response = await fetch(clickhouseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-ClickHouse-User": clickhouseUser,
      "X-ClickHouse-Key": clickhousePassword,
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`ClickHouse query failed: ${response.status} ${await response.text()}`);
  }
};

export const ensureProject = async (projectId: string) => {
  const name = projectId === "default" ? "Default Project" : `Project ${projectId}`;

  await pgPool.query(
    `
      INSERT INTO projects (id, name, api_key)
      VALUES ($1, $2, encode(gen_random_bytes(24), 'hex'))
      ON CONFLICT (id) DO NOTHING
    `,
    [projectId, name],
  );
};

export const getProjectSettings = async (projectId: string) => {
  const result = await pgPool.query(
    `
      SELECT cost_threshold_usd, timeout_threshold_ms
      FROM projects
      WHERE id = $1
    `,
    [projectId],
  );

  return {
    cost_threshold_usd: Number(result.rows[0]?.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(result.rows[0]?.timeout_threshold_ms ?? 0),
  };
};

export const insertSpans = async (records: SpanRecord[]) => {
  if (records.length === 0) {
    return;
  }

  const traceIds = [...new Set(records.map((record) => record.trace_id))];
  const traceIdList = traceIds.map((traceId) => toClickHouseValue(traceId)).join(", ");

  await executeClickHouseQuery(`
    DELETE FROM rifft.spans
    WHERE trace_id IN (${traceIdList})
    SETTINGS mutations_sync = 1
  `);

  const values = records
    .map((record) =>
      [
        toClickHouseValue(record.trace_id),
        toClickHouseValue(record.span_id),
        toClickHouseValue(record.parent_span_id),
        toClickHouseValue(record.name),
        toClickHouseValue(toClickHouseDateTime64(record.start_time)),
        toClickHouseValue(toClickHouseDateTime64(record.end_time)),
        toClickHouseValue(record.duration_ms),
        toClickHouseValue(record.status),
        toClickHouseValue(record.attributes),
        toClickHouseValue(record.events),
        toClickHouseValue(record.resource),
        toClickHouseValue(record.agent_id),
        toClickHouseValue(record.framework),
        toClickHouseValue(record.project_id),
      ].join(", "),
    )
    .map((tuple) => `(${tuple})`)
    .join(",\n");

  const query = `
    INSERT INTO rifft.spans
    (trace_id, span_id, parent_span_id, name, start_time, end_time, duration_ms, status, attributes, events, resource, agent_id, framework, project_id)
    VALUES
    ${values}
  `;

  await executeClickHouseQuery(query);
};

export const upsertTraceSummary = async (summary: TraceSummary) => {
  await pgPool.query(
    `
      INSERT INTO traces (
        trace_id,
        project_id,
        root_span_name,
        started_at,
        ended_at,
        duration_ms,
        status,
        framework,
        agent_count,
        span_count,
        total_cost_usd
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11)
      ON CONFLICT (trace_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        root_span_name = EXCLUDED.root_span_name,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        duration_ms = EXCLUDED.duration_ms,
        status = EXCLUDED.status,
        framework = EXCLUDED.framework,
        agent_count = EXCLUDED.agent_count,
        span_count = EXCLUDED.span_count,
        total_cost_usd = EXCLUDED.total_cost_usd,
        updated_at = NOW()
    `,
    [
      summary.traceId,
      summary.projectId,
      summary.rootSpanName,
      summary.startedAt,
      summary.endedAt,
      summary.durationMs,
      summary.status,
      summary.frameworks,
      summary.agentCount,
      summary.spanCount,
      summary.totalCostUsd,
    ],
  );
};

export const updateTraceFailures = async (traceId: string, failures: unknown[]) => {
  await pgPool.query(
    `
      UPDATE traces
      SET mast_failures = $2::jsonb,
          updated_at = NOW()
      WHERE trace_id = $1
    `,
    [traceId, JSON.stringify(failures)],
  );
};
