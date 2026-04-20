import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://rifft:rifft@localhost:5432/rifft";

const { pgPool } = await import("./db.js");
const { addProjectMember, consumePendingInvites, removeProjectMember } = await import("./queries.js");

type QueryCall = {
  sql: string;
  params: unknown[];
};

type QueryResult = {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
};

const withMockedQueries = async (
  handler: (sql: string, params: unknown[]) => QueryResult | Promise<QueryResult>,
  run: (calls: QueryCall[]) => Promise<void>,
) => {
  const originalQuery = pgPool.query.bind(pgPool);
  const calls: QueryCall[] = [];

  pgPool.query = (async (sql: string, params?: unknown[]) => {
    const normalizedParams = params ?? [];
    calls.push({ sql, params: normalizedParams });

    const trimmedSql = sql.trim();
    if (
      trimmedSql.startsWith("CREATE TABLE IF NOT EXISTS")
      || trimmedSql.startsWith("CREATE INDEX IF NOT EXISTS")
      || trimmedSql.startsWith("ALTER TABLE")
    ) {
      return { rows: [], rowCount: 0 } as never;
    }

    const result = await handler(sql, normalizedParams);
    return {
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    } as never;
  }) as typeof pgPool.query;

  try {
    await run(calls);
  } finally {
    pgPool.query = originalQuery as typeof pgPool.query;
  }
};

test("addProjectMember blocks free-tier invites after one non-owner seat is used", async () => {
  await withMockedQueries(async (sql) => {
    if (sql.includes("SELECT\n        p.id,")) {
      return {
        rows: [
          {
            id: "project-1",
            name: "Workspace",
            account_id: "account-1",
            owner_email: "owner@example.com",
            retention_days: 14,
            cost_threshold_usd: 0,
            timeout_threshold_ms: 0,
            created_at: "2026-04-20T00:00:00.000Z",
            updated_at: "2026-04-20T00:00:00.000Z",
            project_role: "owner",
            account_role: "member",
          },
        ],
      };
    }

    if (sql.includes("SELECT owner_email FROM accounts")) {
      return { rows: [{ owner_email: "owner@example.com" }] };
    }

    if (sql.includes("SELECT account_id") && sql.includes("FROM projects")) {
      return { rows: [{ account_id: "account-1" }] };
    }

    if (sql.includes("FROM subscriptions")) {
      return { rows: [] };
    }

    if (sql.includes("FROM project_memberships") && sql.includes("COUNT(*) AS total")) {
      return { rows: [{ total: "1" }] };
    }

    if (sql.includes("FROM pending_project_invites") && sql.includes("COUNT(*) AS total")) {
      return { rows: [{ total: "0" }] };
    }

    throw new Error(`Unexpected SQL in free-tier limit test: ${sql}`);
  }, async () => {
    const result = await addProjectMember("project-1", "owner-1", "new@example.com");
    assert.deepEqual(result, { ok: false, reason: "member_limit_reached" });
  });
});

test("addProjectMember stores a pending invite when the email has no account yet", async () => {
  await withMockedQueries(async (sql) => {
    if (sql.includes("SELECT\n        p.id,")) {
      return {
        rows: [
          {
            id: "project-1",
            name: "Workspace",
            account_id: "account-1",
            owner_email: "owner@example.com",
            retention_days: 14,
            cost_threshold_usd: 0,
            timeout_threshold_ms: 0,
            created_at: "2026-04-20T00:00:00.000Z",
            updated_at: "2026-04-20T00:00:00.000Z",
            project_role: "owner",
            account_role: "member",
          },
        ],
      };
    }

    if (sql.includes("SELECT owner_email FROM accounts")) {
      return { rows: [{ owner_email: "owner@example.com" }] };
    }

    if (sql.includes("SELECT account_id") && sql.includes("FROM projects")) {
      return { rows: [{ account_id: "account-1" }] };
    }

    if (sql.includes("FROM subscriptions")) {
      return { rows: [{ plan_key: "pro", status: "active" }] };
    }

    if (sql.includes("SELECT pm.user_id")) {
      return { rows: [] };
    }

    if (sql.includes("SELECT id") && sql.includes("FROM accounts")) {
      return { rows: [] };
    }

    if (sql.includes("INSERT INTO pending_project_invites")) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in pending invite test: ${sql}`);
  }, async (calls) => {
    const result = await addProjectMember("project-1", "owner-1", "invitee@example.com");
    assert.deepEqual(result, { ok: true, reason: "pending" });

    const insertCall = calls.find((call) => call.sql.includes("INSERT INTO pending_project_invites"));
    assert.ok(insertCall);
    assert.deepEqual(insertCall.params, ["project-1", "owner-1", "invitee@example.com"]);
  });
});

test("consumePendingInvites promotes pending invites into memberships and clears the queue", async () => {
  await withMockedQueries(async (sql) => {
    if (sql.includes("SELECT project_id") && sql.includes("FROM pending_project_invites")) {
      return {
        rows: [
          { project_id: "project-1" },
          { project_id: "project-2" },
        ],
      };
    }

    if (sql.includes("INSERT INTO project_memberships")) {
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("DELETE FROM pending_project_invites")) {
      return { rows: [], rowCount: 2 };
    }

    throw new Error(`Unexpected SQL in consumePendingInvites test: ${sql}`);
  }, async (calls) => {
    const invitedProjectId = await consumePendingInvites("user-1", "invitee@example.com");
    assert.equal(invitedProjectId, "project-1");

    const membershipInserts = calls.filter((call) =>
      call.sql.includes("INSERT INTO project_memberships")
    );
    assert.equal(membershipInserts.length, 2);
    assert.deepEqual(membershipInserts[0]?.params, ["project-1", "user-1", "invitee@example.com"]);
    assert.deepEqual(membershipInserts[1]?.params, ["project-2", "user-1", "invitee@example.com"]);

    const deleteCall = calls.find((call) => call.sql.includes("DELETE FROM pending_project_invites"));
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.params, ["invitee@example.com"]);
  });
});

test("removeProjectMember protects owners from being removed", async () => {
  await withMockedQueries(async (sql, params) => {
    if (sql.includes("SELECT\n        p.id,")) {
      const [, userId] = params;

      if (userId === "owner-1") {
        return {
          rows: [
            {
              id: "project-1",
              name: "Workspace",
              account_id: "account-1",
              owner_email: "owner@example.com",
              retention_days: 14,
              cost_threshold_usd: 0,
              timeout_threshold_ms: 0,
              created_at: "2026-04-20T00:00:00.000Z",
              updated_at: "2026-04-20T00:00:00.000Z",
              project_role: "owner",
              account_role: "member",
            },
          ],
        };
      }

      if (userId === "target-owner") {
        return {
          rows: [
            {
              id: "project-1",
              name: "Workspace",
              account_id: "account-1",
              owner_email: "target@example.com",
              retention_days: 14,
              cost_threshold_usd: 0,
              timeout_threshold_ms: 0,
              created_at: "2026-04-20T00:00:00.000Z",
              updated_at: "2026-04-20T00:00:00.000Z",
              project_role: "owner",
              account_role: "member",
            },
          ],
        };
      }

      return { rows: [] };
    }

    if (sql.includes("DELETE FROM project_memberships")) {
      throw new Error("Owner protection should stop deletion before DELETE");
    }

    throw new Error(`Unexpected SQL in removeProjectMember test: ${sql}`);
  }, async () => {
    const result = await removeProjectMember("project-1", "owner-1", "target-owner");
    assert.deepEqual(result, { ok: false, reason: "cannot_remove_owner" });
  });
});
