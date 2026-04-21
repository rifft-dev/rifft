import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://rifft:rifft@localhost:5432/rifft";

const { pgPool } = await import("./db.js");
const { createApp } = await import("./index.js");

type QueryResult = {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
};

const makeTraceRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  trace_id: "trace-1",
  project_id: "project-1",
  root_span_name: "root",
  started_at: "2026-04-20T00:00:00.000Z",
  ended_at: "2026-04-20T00:00:01.000Z",
  updated_at: "2026-04-20T00:00:01.000Z",
  duration_ms: 1000,
  status: "error",
  framework: [],
  agent_count: 1,
  span_count: 1,
  total_cost_usd: 0,
  mast_failures: [
    { mode: "fm-1", severity: "fatal", agent_id: "agent-1", explanation: "boom" },
  ],
  ...overrides,
});

const makeAccessibleProject = () => ({
  id: "project-1",
  name: "Workspace",
  account_id: "account-1",
  owner_email: "owner@example.com",
  api_key: null,
  project_role: "member" as const,
  account_role: "member" as const,
  permissions: {
    can_update_settings: false,
    can_manage_billing: false,
    can_rotate_api_keys: false,
  },
  retention_days: 14,
  cost_threshold_usd: 0,
  timeout_threshold_ms: 0,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
});

const withRouteEnv = async (
  {
    traceRow,
    projectRow,
  }: {
    traceRow?: ReturnType<typeof makeTraceRow> | null;
    projectRow?: { account_id: string | null } | null;
  },
  run: () => Promise<void>,
) => {
  const originalQuery = pgPool.query.bind(pgPool);
  const originalFetch = globalThis.fetch;

  let apiKeyInserted = false;
  pgPool.query = (async (sql: string) => {
    const trimmed = sql.trim();
    if (
      trimmed.startsWith("CREATE TABLE IF NOT EXISTS")
      || trimmed.startsWith("CREATE INDEX IF NOT EXISTS")
      || trimmed.startsWith("ALTER TABLE")
    ) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("SELECT project_id") && sql.includes("FROM traces")) {
      return traceRow
        ? { rows: [{ project_id: traceRow.project_id }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM traces") && sql.includes("mast_failures")) {
      return traceRow
        ? { rows: [traceRow], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM projects") && sql.includes("account_id")) {
      if (!projectRow) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          {
            id: "project-1",
            name: "Workspace",
            account_id: projectRow.account_id,
            retention_days: 14,
            cost_threshold_usd: 0,
            timeout_threshold_ms: 0,
            created_at: "2026-04-20T00:00:00.000Z",
            updated_at: "2026-04-20T00:00:00.000Z",
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM api_keys")) {
      if (!apiKeyInserted) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          {
            id: "key_fake",
            project_id: "project-1",
            token: "rifft_fake",
            last_used_at: null,
            revoked_at: null,
            created_at: "2026-04-20T00:00:00.000Z",
          },
        ],
        rowCount: 1,
      };
    }
    if (trimmed.startsWith("INSERT INTO api_keys")) {
      apiKeyInserted = true;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }) as typeof pgPool.query;

  // Stub ClickHouse fetch inside getTrace -> queryClickHouse
  globalThis.fetch = (async () =>
    new Response("", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;

  try {
    await run();
  } finally {
    pgPool.query = originalQuery as typeof pgPool.query;
    globalThis.fetch = originalFetch;
  }
};

test("GET /traces/:traceId/failure-explanation returns 403 for free plan", async () => {
  await withRouteEnv(
    {
      traceRow: makeTraceRow(),
      projectRow: { account_id: null },
    },
    async () => {
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "free" as const,
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t" },
        });
        assert.equal(response.statusCode, 403);
        assert.deepEqual(response.json(), {
          error: "failure_explanations_require_paid_plan",
        });
      } finally {
        await app.close();
      }
    },
  );
});

test("GET /traces/:traceId/failure-explanation serves stored explanation for pro plan", async () => {
  const storedExplanation = {
    trace_id: "trace-1",
    project_id: "project-1",
    summary: "cause",
    evidence: ["ev-1"],
    recommended_fix: "fix it",
    confidence: "high" as const,
    key_stats: [] as Array<{ label: string; value: string; flag: "ok" | "warning" | "critical" }>,
    model: "claude-3-5-sonnet-20241022",
    generated_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };

  await withRouteEnv(
    {
      traceRow: makeTraceRow(),
      projectRow: { account_id: null },
    },
    async () => {
      let generateCalled = false;
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "pro" as const,
        getStoredTraceFailureExplanation: async () => storedExplanation,
        generateFailureExplanation: async () => {
          generateCalled = true;
          return null;
        },
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t" },
        });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), { explanation: storedExplanation });
        assert.equal(generateCalled, false, "generation should not run when a cached explanation exists");
      } finally {
        await app.close();
      }
    },
  );
});

test("GET /traces/:traceId/failure-explanation generates an explanation for scale plan when none is stored", async () => {
  const generated = {
    trace: { project_id: "project-1" },
    explanation: {
      summary: "root cause",
      evidence: ["ev-a"],
      recommended_fix: "rotate keys",
      confidence: "medium" as const,
      key_stats: [] as Array<{ label: string; value: string; flag: "ok" | "warning" | "critical" }>,
      model: "claude-3-5-sonnet-20241022",
    },
  };
  const stored = {
    trace_id: "trace-1",
    project_id: "project-1",
    summary: generated.explanation.summary,
    evidence: generated.explanation.evidence,
    recommended_fix: generated.explanation.recommended_fix,
    confidence: generated.explanation.confidence,
    key_stats: [] as Array<{ label: string; value: string; flag: "ok" | "warning" | "critical" }>,
    model: generated.explanation.model,
    generated_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };

  await withRouteEnv(
    {
      traceRow: makeTraceRow(),
      projectRow: { account_id: null },
    },
    async () => {
      let generateCalls = 0;
      let upsertCalls = 0;
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "scale" as const,
        getStoredTraceFailureExplanation: async () => null,
        generateFailureExplanation: (async () => {
          generateCalls += 1;
          return generated;
        }) as never,
        upsertTraceFailureExplanation: async () => {
          upsertCalls += 1;
          return stored;
        },
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t" },
        });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), { explanation: stored });
        assert.equal(generateCalls, 1);
        assert.equal(upsertCalls, 1);
      } finally {
        await app.close();
      }
    },
  );
});

test("GET /traces/:traceId/failure-explanation surfaces a 500 when ANTHROPIC_API_KEY is missing on a paid plan", async () => {
  await withRouteEnv(
    {
      traceRow: makeTraceRow(),
      projectRow: { account_id: null },
    },
    async () => {
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "pro" as const,
        getStoredTraceFailureExplanation: async () => null,
        generateFailureExplanation: (async () => {
          throw new Error("anthropic_not_configured");
        }) as never,
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t" },
        });
        assert.equal(response.statusCode, 500);
        assert.deepEqual(response.json(), { error: "failure_explanations_not_configured" });
      } finally {
        await app.close();
      }
    },
  );
});

test("GET /traces/:traceId/failure-explanation returns null when the trace has no fatal failure even on scale plan", async () => {
  await withRouteEnv(
    {
      traceRow: makeTraceRow({
        mast_failures: [
          { mode: "fm-1", severity: "benign", agent_id: "agent-1", explanation: "note" },
        ],
      }),
      projectRow: { account_id: null },
    },
    async () => {
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "scale" as const,
        getStoredTraceFailureExplanation: async () => null,
        generateFailureExplanation: (async () => {
          throw new Error("unexpected call");
        }) as never,
      });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t" },
        });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), { explanation: null });
      } finally {
        await app.close();
      }
    },
  );
});

test("POST /traces/:traceId/failure-explanation blocks free plan from regenerating", async () => {
  await withRouteEnv(
    {
      traceRow: makeTraceRow(),
      projectRow: { account_id: null },
    },
    async () => {
      const app = createApp({
        getAuthenticatedUser: async () => null,
        getProjectPlanKey: async () => "free" as const,
      });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/traces/trace-1/failure-explanation",
          headers: { authorization: "Bearer t", "content-type": "application/json" },
          payload: "{}",
        });
        assert.equal(response.statusCode, 403);
        assert.deepEqual(response.json(), {
          error: "failure_explanations_require_paid_plan",
        });
      } finally {
        await app.close();
      }
    },
  );
});
