import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://rifft:rifft@localhost:5432/rifft";

const { createApp } = await import("./index.js");

const makeAccessibleProject = (overrides?: {
  project_role?: "owner" | "member";
  account_role?: "owner" | "member";
  can_update_settings?: boolean;
  can_manage_billing?: boolean;
  can_rotate_api_keys?: boolean;
}) => ({
  id: "project-1",
  name: "Workspace",
  account_id: "account-1",
  owner_email: "owner@example.com",
  api_key: null,
  project_role: overrides?.project_role ?? "member",
  account_role: overrides?.account_role ?? "member",
  permissions: {
    can_update_settings: overrides?.can_update_settings ?? false,
    can_manage_billing: overrides?.can_manage_billing ?? false,
    can_rotate_api_keys: overrides?.can_rotate_api_keys ?? false,
  },
  retention_days: 14,
  cost_threshold_usd: 0,
  timeout_threshold_ms: 0,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
});

test("DELETE /projects/:id/members rejects unauthenticated requests", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => null,
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { user_id: "member-1" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members rejects members without settings access", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "member-1",
      email: "member@example.com",
      name: null,
    }),
    getAccessibleProject: async () => makeAccessibleProject(),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { user_id: "member-2" },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members passes project, remover, and target ids in the correct order", async () => {
  let removeCall:
    | {
        projectId: string;
        removerUserId: string;
        targetUserId: string;
      }
    | null = null;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
        can_rotate_api_keys: true,
      }),
    removeProjectMember: async (projectId, removerUserId, targetUserId) => {
      removeCall = { projectId, removerUserId, targetUserId };
      return { ok: true, reason: null };
    },
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { user_id: "member-9" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.deepEqual(removeCall, {
      projectId: "project-1",
      removerUserId: "owner-1",
      targetUserId: "member-9",
    });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members returns 422 when trying to remove an owner", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
        can_rotate_api_keys: true,
      }),
    removeProjectMember: async () => ({
      ok: false,
      reason: "cannot_remove_owner" as const,
    }),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { user_id: "owner-2" },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), { error: "cannot_remove_owner" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members returns 404 when the member was already removed", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
        can_rotate_api_keys: true,
      }),
    removeProjectMember: async () => ({
      ok: false,
      reason: "member_not_found" as const,
    }),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { user_id: "member-2" },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "member_not_found" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members cancels pending invites through the pending invite query", async () => {
  let deleteInviteCall:
    | {
        query: string;
        params: unknown[];
      }
    | null = null;
  const pgQueryMock = async (query: string, params?: unknown[]) => {
    deleteInviteCall = { query, params: params ?? [] };
    return { rows: [], rowCount: 1 } as never;
  };

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
        can_rotate_api_keys: true,
      }),
    pgQuery: pgQueryMock,
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { pending_email: "invitee@example.com" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    if (!deleteInviteCall) {
      throw new Error("Expected pending invite delete query to be called");
    }
    const recordedCall: { query: string; params: unknown[] } = deleteInviteCall;
    assert.match(recordedCall.query, /DELETE FROM pending_project_invites/);
    assert.deepEqual(recordedCall.params, ["project-1", "invitee@example.com"]);
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members returns 404 when the pending invite was already removed", async () => {
  const pgQueryMock = async () => ({ rowCount: 0 });

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
        can_rotate_api_keys: true,
      }),
    pgQuery: pgQueryMock,
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { pending_email: "invitee@example.com" },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "pending_invite_not_found" });
  } finally {
    await app.close();
  }
});

test("POST /projects/:id/members returns 403 when the free-plan member limit is reached", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    addProjectMember: async () => ({
      ok: false,
      reason: "member_limit_reached" as const,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/projects/project-1/members",
      payload: { email: "newmember@example.com", role: "member" },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "member_limit_reached" });
  } finally {
    await app.close();
  }
});

test("POST /projects/:id/members returns 409 when the user is already a member", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    addProjectMember: async () => ({
      ok: false,
      reason: "already_member" as const,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/projects/project-1/members",
      payload: { email: "existing@example.com", role: "member" },
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), { error: "already_member" });
  } finally {
    await app.close();
  }
});

test("POST /projects/:id/members returns 422 when inviting yourself", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    addProjectMember: async () => ({
      ok: false,
      reason: "cannot_invite_self" as const,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/projects/project-1/members",
      payload: { email: "owner@example.com", role: "member" },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), { error: "cannot_invite_self" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id/members blocks pending invite cancellation without settings access", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "member-1",
      email: "member@example.com",
      name: null,
    }),
    getAccessibleProject: async () => makeAccessibleProject(),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1/members",
      payload: { pending_email: "invitee@example.com" },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  } finally {
    await app.close();
  }
});

test("GET /projects/:id/members returns 404 when the project is inaccessible", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "member-1",
      email: "member@example.com",
      name: null,
    }),
    getAccessibleProject: async () => null,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/projects/project-1/members",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});

test("GET /projects/:id/alerts returns alert settings for accessible workspaces", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
      }),
    getProjectAlertSettings: async () => ({
      available: true,
      plan_key: "pro" as const,
      fatal_failures_enabled: true,
      slack: {
        configured: true,
        target: "hooks.slack.com ••••1234",
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      email: {
        configured: true,
        target: "oncall@example.com",
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      recent_deliveries: [],
    }),
    getProjectAlertDeliveryTargets: async () => ({
      slack_webhook_url: null,
      alert_email: null,
    }),
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/projects/project-1/alerts",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().fatal_failures_enabled, true);
    assert.equal(response.json().slack.target, "hooks.slack.com ••••1234");
  } finally {
    await app.close();
  }
});

test("PATCH /projects/:id/alerts requires a paid plan", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
      }),
    getProjectAlertSettings: async () => ({
      available: false,
      plan_key: "free" as const,
      fatal_failures_enabled: false,
      slack: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      email: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      recent_deliveries: [],
    }),
    getProjectAlertDeliveryTargets: async () => ({
      slack_webhook_url: null,
      alert_email: null,
    }),
  });

  try {
    const response = await app.inject({
      method: "PATCH",
      url: "/projects/project-1/alerts",
      payload: {
        fatal_failures_enabled: true,
        alert_email: "oncall@example.com",
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "alerting_requires_paid_plan" });
  } finally {
    await app.close();
  }
});

test("PATCH /projects/:id/alerts maps missing destinations to 422", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
      }),
    getProjectAlertSettings: async () => ({
      available: true,
      plan_key: "pro" as const,
      fatal_failures_enabled: false,
      slack: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      email: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      recent_deliveries: [],
    }),
    updateProjectAlertSettings: async () => {
      throw new Error("alert_destination_required");
    },
  });

  try {
    const response = await app.inject({
      method: "PATCH",
      url: "/projects/project-1/alerts",
      payload: {
        fatal_failures_enabled: true,
      },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), { error: "alert_destination_required" });
  } finally {
    await app.close();
  }
});

test("POST /projects/:id/alerts/test returns 422 when the requested channel has no destination", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        can_update_settings: true,
      }),
    getProjectAlertSettings: async () => ({
      available: true,
      plan_key: "pro" as const,
      fatal_failures_enabled: true,
      slack: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      email: {
        configured: false,
        target: null,
        last_tested_at: null,
        last_alert_at: null,
        last_error: null,
      },
      recent_deliveries: [],
    }),
    getProjectAlertDeliveryTargets: async () => ({
      slack_webhook_url: null,
      alert_email: null,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/projects/project-1/alerts/test",
      payload: {
        channel: "slack",
      },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), { error: "alert_destination_required" });
  } finally {
    await app.close();
  }
});

test("POST /cloud/bootstrap rejects unauthenticated requests", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => null,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/bootstrap",
      payload: {},
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
  } finally {
    await app.close();
  }
});

test("POST /cloud/bootstrap keeps the bootstrapped workspace active even when a pending invite is consumed", async () => {
  let consumeCall:
    | {
        userId: string;
        email: string;
      }
    | null = null;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "invitee@example.com",
      name: "Invitee",
    }),
    bootstrapCloudProject: async () => ({
      id: "bootstrap-project",
      name: "Bootstrap Workspace",
      account_id: "account-1",
      owner_email: "invitee@example.com",
      api_key: "key",
      project_role: "owner",
      account_role: "owner",
      permissions: {
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      },
      retention_days: 14,
      cost_threshold_usd: 0,
      timeout_threshold_ms: 0,
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    }),
    consumePendingInvites: async (userId, email) => {
      consumeCall = { userId, email };
      return "invited-project";
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/bootstrap",
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      project: {
        id: "bootstrap-project",
        name: "Bootstrap Workspace",
        account_id: "account-1",
        owner_email: "invitee@example.com",
        api_key: "key",
        project_role: "owner",
        account_role: "owner",
        permissions: {
          can_update_settings: true,
          can_manage_billing: true,
          can_rotate_api_keys: true,
        },
        retention_days: 14,
        cost_threshold_usd: 0,
        timeout_threshold_ms: 0,
        created_at: "2026-04-20T00:00:00.000Z",
        updated_at: "2026-04-20T00:00:00.000Z",
      },
      active_project_id: "bootstrap-project",
      invited_project_id: "invited-project",
    });
    assert.deepEqual(consumeCall, {
      userId: "user-1",
      email: "invitee@example.com",
    });
  } finally {
    await app.close();
  }
});

test("POST /cloud/bootstrap falls back to the bootstrapped workspace when no pending invite is consumed", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
    }),
    bootstrapCloudProject: async () => ({
      id: "bootstrap-project",
      name: "Bootstrap Workspace",
      account_id: "account-1",
      owner_email: "owner@example.com",
      api_key: "key",
      project_role: "owner",
      account_role: "owner",
      permissions: {
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      },
      retention_days: 14,
      cost_threshold_usd: 0,
      timeout_threshold_ms: 0,
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    }),
    consumePendingInvites: async () => null,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/bootstrap",
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().active_project_id, "bootstrap-project");
    assert.equal(response.json().invited_project_id, null);
  } finally {
    await app.close();
  }
});

test("POST /cloud/bootstrap does not attempt invite consumption when the user has no email", async () => {
  let consumeCalled = false;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: null,
      name: "No Email",
    }),
    bootstrapCloudProject: async () => ({
      id: "bootstrap-project",
      name: "Bootstrap Workspace",
      account_id: "account-1",
      owner_email: null,
      api_key: "key",
      project_role: "owner",
      account_role: "owner",
      permissions: {
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      },
      retention_days: 14,
      cost_threshold_usd: 0,
      timeout_threshold_ms: 0,
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    }),
    consumePendingInvites: async () => {
      consumeCalled = true;
      return "unexpected-project";
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/bootstrap",
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().active_project_id, "bootstrap-project");
    assert.equal(response.json().invited_project_id, null);
    assert.equal(consumeCalled, false);
  } finally {
    await app.close();
  }
});

test("POST /cloud/projects rejects unauthenticated requests", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => null,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/projects",
      payload: { name: "New Workspace" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
  } finally {
    await app.close();
  }
});

test("POST /cloud/projects returns 403 when a non-billing owner tries to create a workspace from the current project", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "member-1",
      email: "member@example.com",
      name: null,
    }),
    createCloudWorkspaceForUser: async () => {
      throw new Error("forbidden");
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/projects",
      payload: { name: "New Workspace", current_project_id: "project-1" },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  } finally {
    await app.close();
  }
});

test("POST /cloud/projects returns 400 when no owned account is available", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "user-1",
      email: "user@example.com",
      name: null,
    }),
    createCloudWorkspaceForUser: async () => {
      throw new Error("missing_account");
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/projects",
      payload: { name: "New Workspace" },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "missing_account" });
  } finally {
    await app.close();
  }
});

test("POST /cloud/projects creates a workspace for an eligible account owner", async () => {
  let createCall:
    | {
        userId: string;
        email: string | null;
        name: string;
        currentProjectId: string | null;
      }
    | null = null;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
    }),
    createCloudWorkspaceForUser: async ({ userId, email, name, currentProjectId }) => {
      createCall = { userId, email, name, currentProjectId: currentProjectId ?? null };
      return makeAccessibleProject({
        project_role: "owner",
        account_role: "owner",
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      });
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/cloud/projects",
      payload: { name: "New Workspace", current_project_id: "project-1" },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().project.id, "project-1");
    assert.deepEqual(createCall, {
      userId: "owner-1",
      email: "owner@example.com",
      name: "New Workspace",
      currentProjectId: "project-1",
    });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id rejects unauthenticated access to account-backed workspaces", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => null,
    getProject: async () => ({
      ...makeAccessibleProject(),
    }),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id returns 403 for authenticated users without settings access", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "member-1",
      email: "member@example.com",
      name: null,
    }),
    getAccessibleProject: async () => makeAccessibleProject(),
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1",
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "forbidden" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id protects the primary workspace", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        account_role: "owner",
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      }),
    isPrimaryWorkspace: async () => true,
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1",
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), { error: "primary_workspace_protected" });
  } finally {
    await app.close();
  }
});

test("DELETE /projects/:id deletes a non-primary workspace for an eligible owner", async () => {
  let deletedProjectId: string | null = null;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getAccessibleProject: async () =>
      makeAccessibleProject({
        project_role: "owner",
        account_role: "owner",
        can_update_settings: true,
        can_manage_billing: true,
        can_rotate_api_keys: true,
      }),
    isPrimaryWorkspace: async () => false,
    deleteProject: async (projectId) => {
      deletedProjectId = projectId;
    },
  });

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/projects/project-1",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.equal(deletedProjectId, "project-1");
  } finally {
    await app.close();
  }
});

test("POST /stripe/customer-portal rejects unauthenticated requests", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => null,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/stripe/customer-portal",
      payload: { account_id: "account-1" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
  } finally {
    await app.close();
  }
});

test("POST /stripe/customer-portal requires an account id", async () => {
  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/stripe/customer-portal",
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "missing_account_id" });
  } finally {
    await app.close();
  }
});

test("POST /stripe/customer-portal returns 500 when Stripe is not configured", async () => {
  const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/stripe/customer-portal",
      payload: { account_id: "account-1" },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "stripe_not_configured" });
  } finally {
    if (previousStripeSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }
    await app.close();
  }
});

test("POST /stripe/customer-portal returns 404 when there is no Stripe customer for the account", async () => {
  const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getStripeCustomerIdForAccount: async () => null,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/stripe/customer-portal",
      payload: { account_id: "account-1" },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "no_stripe_customer" });
  } finally {
    if (previousStripeSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }
    await app.close();
  }
});

test("POST /stripe/customer-portal returns the billing portal url for an eligible account", async () => {
  const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  let lookedUpAccountId: string | null = null;
  let billingPortalArgs:
    | {
        customerId: string;
        returnUrl: string;
      }
    | null = null;

  const app = createApp({
    getAuthenticatedUser: async () => ({
      id: "owner-1",
      email: "owner@example.com",
      name: null,
    }),
    getStripeCustomerIdForAccount: async (accountId) => {
      lookedUpAccountId = accountId;
      return "cus_123";
    },
    createStripeBillingPortalSession: async ({ customerId, returnUrl }) => {
      billingPortalArgs = { customerId, returnUrl };
      return "https://billing.example.com/session";
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/stripe/customer-portal",
      payload: {
        account_id: "account-1",
        return_url: "https://app.rifft.dev/settings",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { url: "https://billing.example.com/session" });
    assert.equal(lookedUpAccountId, "account-1");
    assert.deepEqual(billingPortalArgs, {
      customerId: "cus_123",
      returnUrl: "https://app.rifft.dev/settings",
    });
  } finally {
    if (previousStripeSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }
    await app.close();
  }
});
