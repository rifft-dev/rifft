import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://rifft:rifft@localhost:5432/rifft";

const { pgPool } = await import("./db.js");
const {
  getAgentFailureDiff,
  getTraceAttributeCorrelations,
} = await import("./queries.js");

type QueryResult = {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
};

const withMockedAnalyticsDeps = async (
  {
    pgHandler,
    clickhouseRows,
  }: {
    pgHandler: (sql: string, params: unknown[]) => QueryResult | Promise<QueryResult>;
    clickhouseRows: Array<Record<string, unknown>>;
  },
  run: () => Promise<void>,
) => {
  const originalQuery = pgPool.query.bind(pgPool);
  const originalFetch = globalThis.fetch;

  pgPool.query = (async (sql: string, params?: unknown[]) => {
    const trimmedSql = sql.trim();
    if (
      trimmedSql.startsWith("CREATE TABLE IF NOT EXISTS")
      || trimmedSql.startsWith("CREATE INDEX IF NOT EXISTS")
      || trimmedSql.startsWith("ALTER TABLE")
    ) {
      return { rows: [], rowCount: 0 } as never;
    }

    const result = await pgHandler(sql, params ?? []);
    return {
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    } as never;
  }) as typeof pgPool.query;

  globalThis.fetch = (async () =>
    new Response(
      clickhouseRows.map((row) => JSON.stringify(row)).join("\n"),
      { status: 200, headers: { "content-type": "text/plain" } },
    )) as typeof fetch;

  try {
    await run();
  } finally {
    pgPool.query = originalQuery as typeof pgPool.query;
    globalThis.fetch = originalFetch;
  }
};

test("getAgentFailureDiff uses true medians for even-sized samples", async () => {
  const traces = [
    { trace_id: "fatal-1", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "fatal-2", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "fatal-3", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "fatal-4", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "ok-1", mast_failures: [] },
    { trace_id: "ok-2", mast_failures: [] },
    { trace_id: "ok-3", mast_failures: [] },
    { trace_id: "ok-4", mast_failures: [] },
  ];

  const clickhouseRows = [
    { trace_id: "fatal-1", agent_id: "agent-1", max_input_tokens: "10", total_duration_ms: "100" },
    { trace_id: "fatal-2", agent_id: "agent-1", max_input_tokens: "30", total_duration_ms: "300" },
    { trace_id: "fatal-3", agent_id: "agent-1", max_input_tokens: "50", total_duration_ms: "500" },
    { trace_id: "fatal-4", agent_id: "agent-1", max_input_tokens: "70", total_duration_ms: "700" },
    { trace_id: "ok-1", agent_id: "agent-1", max_input_tokens: "20", total_duration_ms: "200" },
    { trace_id: "ok-2", agent_id: "agent-1", max_input_tokens: "40", total_duration_ms: "400" },
    { trace_id: "ok-3", agent_id: "agent-1", max_input_tokens: "60", total_duration_ms: "600" },
    { trace_id: "ok-4", agent_id: "agent-1", max_input_tokens: "80", total_duration_ms: "800" },
  ];

  await withMockedAnalyticsDeps(
    {
      pgHandler: async (sql) => {
        if (sql.includes("SELECT trace_id, mast_failures") && sql.includes("FROM traces")) {
          return { rows: traces };
        }
        throw new Error(`Unexpected SQL in median test: ${sql}`);
      },
      clickhouseRows,
    },
    async () => {
      const results = await getAgentFailureDiff("project-1");
      assert.equal(results.length, 1);
      assert.equal(results[0]?.input_tokens?.fatal_median, 40);
      assert.equal(results[0]?.input_tokens?.success_median, 50);
      assert.equal(results[0]?.duration_ms?.fatal_median, 400);
      assert.equal(results[0]?.duration_ms?.success_median, 500);
    },
  );
});

test("getTraceAttributeCorrelations keeps zero-valued traces in the below-threshold baseline", async () => {
  const traces = [
    { trace_id: "fatal-1", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "fatal-2", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "fatal-3", mast_failures: [{ severity: "fatal" }] },
    { trace_id: "ok-low-1", mast_failures: [] },
    { trace_id: "ok-low-2", mast_failures: [] },
    { trace_id: "ok-zero-1", mast_failures: [] },
    { trace_id: "ok-zero-2", mast_failures: [] },
    { trace_id: "ok-zero-3", mast_failures: [] },
    { trace_id: "ok-zero-4", mast_failures: [] },
    { trace_id: "ok-zero-5", mast_failures: [] },
  ];

  const clickhouseRows = [
    { trace_id: "fatal-1", max_input_tokens: "100", total_cost_usd: "2", total_duration_ms: "1000" },
    { trace_id: "fatal-2", max_input_tokens: "100", total_cost_usd: "2", total_duration_ms: "1000" },
    { trace_id: "fatal-3", max_input_tokens: "100", total_cost_usd: "2", total_duration_ms: "1000" },
    { trace_id: "ok-low-1", max_input_tokens: "10", total_cost_usd: "0.2", total_duration_ms: "100" },
    { trace_id: "ok-low-2", max_input_tokens: "10", total_cost_usd: "0.2", total_duration_ms: "100" },
    { trace_id: "ok-zero-1", max_input_tokens: "0", total_cost_usd: "0", total_duration_ms: "0" },
    { trace_id: "ok-zero-2", max_input_tokens: "0", total_cost_usd: "0", total_duration_ms: "0" },
    { trace_id: "ok-zero-3", max_input_tokens: "0", total_cost_usd: "0", total_duration_ms: "0" },
    { trace_id: "ok-zero-4", max_input_tokens: "0", total_cost_usd: "0", total_duration_ms: "0" },
    { trace_id: "ok-zero-5", max_input_tokens: "0", total_cost_usd: "0", total_duration_ms: "0" },
  ];

  await withMockedAnalyticsDeps(
    {
      pgHandler: async (sql) => {
        if (sql.includes("SELECT trace_id, mast_failures") && sql.includes("FROM traces")) {
          return { rows: traces };
        }
        throw new Error(`Unexpected SQL in correlation test: ${sql}`);
      },
      clickhouseRows,
    },
    async () => {
      const findings = await getTraceAttributeCorrelations("project-1");
      assert.ok(findings.length > 0);
      assert.equal(findings[0]?.attribute, "max_input_tokens");
      assert.equal(findings[0]?.total_traces, 10);
      assert.equal(findings[0]?.total_traces_above, 3);
      assert.equal(findings[0]?.failure_rate_below, 0);
    },
  );
});
