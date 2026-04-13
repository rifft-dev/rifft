import { Pool } from "pg";
import { randomBytes } from "node:crypto";

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

type CloudPlanPolicy = {
  key: "self_hosted" | "free" | "pro";
  monthlySpanLimit: number;
  retentionDays: number;
};

let apiKeysTableEnsured = false;
let subscriptionsTableEnsured = false;

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

const ensurePrimaryApiKey = async (projectId: string) => {
  await ensureApiKeysTable();

  const existing = await pgPool.query<{ token: string }>(
    `
      SELECT token
      FROM api_keys
      WHERE project_id = $1
        AND revoked_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [projectId],
  );

  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0].token;
  }

  const token = `rft_live_${randomBytes(18).toString("hex")}`;
  await pgPool.query(
    `
      INSERT INTO api_keys (id, project_id, name, token)
      VALUES ($1, $2, 'default', $3)
    `,
    [`key_${randomBytes(12).toString("hex")}`, projectId, token],
  );

  return token;
};

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

const queryClickHouseJson = async <T>(query: string): Promise<T[]> => {
  const response = await fetch(`${clickhouseUrl}?default_format=JSONEachRow`, {
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

  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
};

const ensureSubscriptionsTable = async () => {
  if (subscriptionsTableEnsured) {
    return;
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
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

  subscriptionsTableEnsured = true;
};

const getPlanPolicy = (planKey: string): CloudPlanPolicy =>
  planKey === "pro"
    ? { key: "pro", monthlySpanLimit: 500_000, retentionDays: 90 }
    : { key: "free", monthlySpanLimit: 10_000, retentionDays: 7 };

export const ensureProject = async (projectId: string) => {
  const name = projectId === "default" ? "Default Project" : `Project ${projectId}`;

  await pgPool.query(
    `
      INSERT INTO projects (id, name)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `,
    [projectId, name],
  );

  await ensurePrimaryApiKey(projectId);
};

export const getProjectSettings = async (projectId: string) => {
  const result = await pgPool.query(
    `
      SELECT cost_threshold_usd, timeout_threshold_ms, retention_days, account_id
      FROM projects
      WHERE id = $1
    `,
    [projectId],
  );

  const accountId = (result.rows[0]?.account_id as string | null | undefined) ?? null;
  let planPolicy: CloudPlanPolicy = accountId
    ? getPlanPolicy("free")
    : {
        key: "self_hosted",
        monthlySpanLimit: Number.MAX_SAFE_INTEGER,
        retentionDays: Number(result.rows[0]?.retention_days ?? 30),
      };

  if (accountId) {
    await ensureSubscriptionsTable();
    const subscriptionResult = await pgPool.query<{
      plan_key: string;
      status: string;
    }>(
      `
        SELECT plan_key, status
        FROM subscriptions
        WHERE account_id = $1
        ORDER BY
          CASE
            WHEN status IN ('active', 'trialing') THEN 0
            ELSE 1
          END,
          updated_at DESC
        LIMIT 1
      `,
      [accountId],
    );

    const subscription = subscriptionResult.rows[0];
    if (subscription && ["active", "trialing"].includes(subscription.status)) {
      planPolicy = getPlanPolicy(subscription.plan_key);
    }
  }

  return {
    cost_threshold_usd: Number(result.rows[0]?.cost_threshold_usd ?? 0),
    timeout_threshold_ms: Number(result.rows[0]?.timeout_threshold_ms ?? 0),
    retention_days: Number(result.rows[0]?.retention_days ?? planPolicy.retentionDays),
    monthly_span_limit: planPolicy.monthlySpanLimit,
    plan_key: planPolicy.key,
    account_id: accountId,
  };
};

export const getProjectIdForApiKey = async (token: string) => {
  await ensureApiKeysTable();

  const result = await pgPool.query<{ project_id: string }>(
    `
      SELECT project_id
      FROM api_keys
      WHERE token = $1
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [token],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const projectId = result.rows[0]?.project_id ?? null;
  if (!projectId) {
    return null;
  }

  await pgPool.query(
    `
      UPDATE api_keys
      SET last_used_at = NOW()
      WHERE token = $1
    `,
    [token],
  );

  return projectId;
};

const getCurrentMonthSpanUsage = async (projectId: string) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);

  const rows = await queryClickHouseJson<{ total: number | string }>(
    `
      SELECT COUNT(*) AS total
      FROM rifft.spans
      WHERE project_id = ${escapeClickHouseString(projectId)}
        AND start_time >= toDateTime(${escapeClickHouseString(monthStart.toISOString().slice(0, 19).replace("T", " "))})
        AND start_time < toDateTime(${escapeClickHouseString(nextMonthStart.toISOString().slice(0, 19).replace("T", " "))})
    `,
  );

  return Number(rows[0]?.total ?? 0);
};

const getExistingSpanCountForTraceIds = async (traceIds: string[]) => {
  if (traceIds.length === 0) {
    return 0;
  }

  const values = traceIds.map((traceId) => escapeClickHouseString(traceId)).join(", ");
  const rows = await queryClickHouseJson<{ total: number | string }>(
    `
      SELECT COUNT(*) AS total
      FROM rifft.spans
      WHERE trace_id IN (${values})
    `,
  );

  return Number(rows[0]?.total ?? 0);
};

export const checkProjectIngestAllowance = async (projectId: string, incomingSpanCount: number, traceIds: string[]) => {
  const settings = await getProjectSettings(projectId);
  const currentUsage = await getCurrentMonthSpanUsage(projectId);
  const existingSpanCount = await getExistingSpanCountForTraceIds(traceIds);
  const netNewSpans = Math.max(0, incomingSpanCount - existingSpanCount);
  const projectedUsage = currentUsage + netNewSpans;

  return {
    allowed: projectedUsage <= settings.monthly_span_limit,
    plan_key: settings.plan_key,
    current_usage: currentUsage,
    projected_usage: projectedUsage,
    limit: settings.monthly_span_limit,
    retention_days: settings.retention_days,
  };
};

export const pruneProjectRetention = async (projectId: string, retentionDays: number) => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const traceResult = await pgPool.query<{ trace_id: string }>(
    `
      SELECT trace_id
      FROM traces
      WHERE project_id = $1
        AND started_at < $2
    `,
    [projectId, cutoff.toISOString()],
  );

  const traceIds = traceResult.rows.map((row) => row.trace_id).filter(Boolean);
  if (traceIds.length === 0) {
    return 0;
  }

  const traceIdList = traceIds.map((traceId) => escapeClickHouseString(traceId)).join(", ");
  await executeClickHouseQuery(`
    DELETE FROM rifft.spans
    WHERE trace_id IN (${traceIdList})
    SETTINGS mutations_sync = 1
  `);

  await pgPool.query(
    `
      DELETE FROM traces
      WHERE trace_id = ANY($1::text[])
    `,
    [traceIds],
  );

  return traceIds.length;
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
