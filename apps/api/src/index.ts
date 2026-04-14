import { createHmac, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { closePools, pgPool } from "./db.js";
import { getBearerToken, getSupabaseAdminClient, isSupabaseConfigured } from "./supabase.js";
import {
  bootstrapCloudProject,
  createProject,
  getAccessibleProject,
  getProject,
  getDefaultProjectForUser,
  getAgentDetail,
  regenerateProjectApiKey,
  getCloudProjectUsageSummary,
  getProjectBaseline,
  getProjectInsights,
  syncPolarSubscription,
  getTraceProjectId,
  listForkDrafts,
  listProjectsForUser,
  getTrace,
  getTraceComparison,
  getTraceGraph,
  getTraceTimeline,
  listProjects,
  listTraces,
  setProjectBaseline,
  upsertForkDraft,
  updateProjectSettings,
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
  getAlertCandidatesForTrace,
  consumePendingInvites,
} from "./queries.js";

const port = Number(process.env.PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL ?? "";
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? "";

const app = Fastify({ logger: true });

app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
  try {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    (request as FastifyRequest & { rawBody?: string }).rawBody = rawBody;
    done(null, JSON.parse(rawBody));
  } catch (error) {
    done(error as Error, undefined);
  }
});

type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

const getAuthenticatedUser = async (authorizationHeader?: string): Promise<AuthenticatedUser | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name:
      (data.user.user_metadata.full_name as string | undefined) ??
      (data.user.user_metadata.name as string | undefined) ??
      null,
  };
};

const canAccessTrace = async (user: AuthenticatedUser | null, traceId: string) => {
  const projectId = await getTraceProjectId(traceId);
  if (!projectId) {
    return false;
  }

  const project = await getProject(projectId);
  if (!project) {
    return false;
  }

  if (!user) {
    return !project.account_id;
  }

  const accessibleProject = await getAccessibleProject(user.id, projectId);
  return Boolean(accessibleProject);
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyPolarWebhookSignature = (request: FastifyRequest & { rawBody?: string }) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const body = request.rawBody ?? "";
  const webhookId = request.headers["webhook-id"];
  const webhookTimestamp = request.headers["webhook-timestamp"];
  const webhookSignature = request.headers["webhook-signature"];

  if (
    typeof webhookId !== "string" ||
    typeof webhookTimestamp !== "string" ||
    typeof webhookSignature !== "string"
  ) {
    return false;
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
  const expected = createHmac("sha256", secret).update(signedContent).digest("base64");
  const candidates = webhookSignature
    .split(" ")
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.startsWith("v1,")) {
        return entry.slice(3);
      }
      if (entry.startsWith("v1=")) {
        return entry.slice(3);
      }
      if (entry.startsWith("v1")) {
        return entry.slice(2).replace(/^[=,]/, "");
      }
      return entry;
    });

  return candidates.some((candidate) => safeEqual(candidate, expected));
};

app.get("/health", async () => ({
  status: "ok",
  service: "api",
  dependencies: {
    postgresConfigured: databaseUrl.length > 0,
    clickhouseConfigured: clickhouseUrl.length > 0,
    supabaseConfigured: supabaseUrl.length > 0,
  },
}));

app.post("/webhooks/polar", async (request, reply) => {
  const typedRequest = request as FastifyRequest & { rawBody?: string };
  if (!verifyPolarWebhookSignature(typedRequest)) {
    reply.code(401);
    return { error: "invalid_signature" };
  }

  const body = request.body as Record<string, unknown> | null;
  const eventType =
    (body && typeof body.type === "string" ? body.type : null) ??
    (body && typeof body.event === "string" ? body.event : null);

  if (!body || !eventType) {
    reply.code(400);
    return { error: "invalid_event" };
  }

  if (!eventType.startsWith("subscription.")) {
    return { received: true, ignored: true };
  }

  const payload =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : body;

  const result = await syncPolarSubscription(eventType, payload);
  return {
    received: true,
    ...result,
  };
});

app.get("/projects", async () => ({
  projects: await listProjects(),
}));

app.get("/cloud/me", async (request, reply) => {
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const activeProject = await getDefaultProjectForUser(user.id);
  return {
    user,
    active_project: activeProject,
  };
});

app.get("/cloud/projects", async (request, reply) => {
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  return {
    projects: await listProjectsForUser(user.id),
  };
});

app.get("/projects/:id", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  const project = user
    ? await getAccessibleProject(user.id, projectId)
    : await getProject(projectId);
  if (!user && project?.account_id) {
    reply.code(404);
    return { error: "not_found" };
  }
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.post("/projects", async (request, reply) => {
  const bodySchema = z.object({
    name: z.string().min(1).max(100),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const project = await createProject(parsed.data.name);
  reply.code(201);
  return project;
});

app.post("/cloud/bootstrap", async (request, reply) => {
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const project = await bootstrapCloudProject({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  if (user.email) {
    await consumePendingInvites(user.id, user.email);
  }

  return { project };
});

app.patch("/projects/:id", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.object({
    retention_days: z.number().int().min(7).max(3650).optional(),
    cost_threshold_usd: z.number().min(0).optional(),
    timeout_threshold_ms: z.number().int().min(0).optional(),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const project = await updateProjectSettings(projectId, parsed.data);
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.post("/projects/:id/regenerate-api-key", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_rotate_api_keys) {
      reply.code(403);
      return { error: "forbidden" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const project = await regenerateProjectApiKey(projectId);
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.get("/projects/:id/usage", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const summary = await getCloudProjectUsageSummary(projectId);
  if (!summary) {
    reply.code(404);
    return { error: "not_found" };
  }

  return summary;
});

app.get("/projects/:id/insights", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  return getProjectInsights(projectId);
});

app.get("/projects/:id/baseline", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  return {
    baseline: await getProjectBaseline(projectId),
  };
});

app.post("/projects/:id/baseline", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.object({
    trace_id: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const baseline = await setProjectBaseline(projectId, parsed.data.trace_id, user?.id ?? null);
  if (!baseline) {
    reply.code(400);
    return { error: "invalid_trace" };
  }

  return {
    baseline,
  };
});

app.get("/projects/:id/traces", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    framework: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });
  const parsed = querySchema.safeParse(request.query);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_query",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const result = await listTraces({
    projectId,
    page: parsed.data.page,
    pageSize: parsed.data.page_size,
    status: parsed.data.status,
    framework: parsed.data.framework,
    from: parsed.data.from,
    to: parsed.data.to,
  });

  return {
    traces: result.traces,
    total: result.total,
    page: parsed.data.page,
  };
});

app.get("/traces/:traceId", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  return trace;
});

app.get("/traces/:traceId/live", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  const canAccess = await canAccessTrace(user, traceId);
  if (!canAccess) {
    reply.code(404);
    return { error: "not_found" };
  }

  const [trace, graph, timeline] = await Promise.all([
    getTrace(traceId),
    getTraceGraph(traceId),
    getTraceTimeline(traceId),
  ]);

  if (!trace || !graph || !timeline) {
    reply.code(404);
    return { error: "not_found" };
  }

  const now = Date.now();
  const lastActivityAt = trace.updated_at ?? trace.ended_at;
  const lastActivityMs = new Date(lastActivityAt).getTime();
  const startedAtMs = new Date(trace.started_at).getTime();
  const isRecentlyActive = now - lastActivityMs < 15_000;
  const startedRecently = now - startedAtMs < 10 * 60_000;
  const isLive = trace.status === "unset" || (isRecentlyActive && startedRecently);

  return {
    trace,
    graph,
    timeline,
    live: {
      is_live: isLive,
      last_activity_at: lastActivityAt,
    },
  };
});

app.get("/traces/:traceId/comparison", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  const canAccess = await canAccessTrace(user, traceId);
  if (!canAccess) {
    reply.code(404);
    return { error: "not_found" };
  }

  const comparison = await getTraceComparison(traceId);
  return {
    comparison,
  };
});

app.get("/traces/:traceId/graph", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const graph = await getTraceGraph(traceId);
  if (!graph) {
    reply.code(404);
    return { error: "not_found" };
  }

  return graph;
});

app.get("/traces/:traceId/timeline", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const timeline = await getTraceTimeline(traceId);
  if (!timeline) {
    reply.code(404);
    return { error: "not_found" };
  }

  return timeline;
});

app.get("/traces/:traceId/fork-drafts", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  return {
    drafts: await listForkDrafts(traceId),
  };
});

app.put("/traces/:traceId/fork-drafts/:spanId", async (request, reply) => {
  const params = request.params as { traceId: string; spanId: string };
  const bodySchema = z.object({
    payload: z.unknown(),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, params.traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(params.traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  const spanExists = trace.communication_spans.some((span) => span.span_id === params.spanId);
  if (!spanExists) {
    reply.code(404);
    return { error: "span_not_found" };
  }

  return upsertForkDraft(params.traceId, params.spanId, parsed.data.payload);
});

app.get("/traces/:traceId/agents/:agentId", async (request, reply) => {
  const params = request.params as { traceId: string; agentId: string };
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, params.traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const detail = await getAgentDetail(params.traceId, params.agentId);
  if (!detail) {
    reply.code(404);
    return { error: "not_found" };
  }

  return detail;
});

const dispatchFatalFailureAlert = async (traceId: string) => {
  const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
  const candidates = await getAlertCandidatesForTrace(traceId);
  if (!candidates) {
    return;
  }

  const payload = {
    event: "trace.fatal_failure",
    trace_id: candidates.trace_id,
    project_id: candidates.project_id,
    project_name: candidates.project_name,
    started_at: candidates.started_at,
    total_cost_usd: candidates.total_cost_usd,
    fatal_failures: candidates.fatal_failures.map((f: { mode: string; agent_id: string | null; explanation: string }) => ({
      mode: f.mode,
      agent_id: f.agent_id,
      explanation: f.explanation,
    })),
    trace_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rifft.dev"}/traces/${traceId}`,
  };

  if (alertWebhookUrl) {
    await fetch(alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((error) => {
      app.log.warn({ error, traceId }, "Alert webhook dispatch failed");
    });
  }
};

app.post("/internal/traces/:traceId/alert", async (request, reply) => {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (internalSecret) {
    const provided = request.headers["x-internal-secret"];
    if (provided !== internalSecret) {
      reply.code(401);
      return { error: "unauthorized" };
    }
  }

  const traceId = (request.params as { traceId: string }).traceId;
  await dispatchFatalFailureAlert(traceId);
  return { ok: true };
});

app.get("/projects/:id/members", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const accessibleProject = await getAccessibleProject(user.id, projectId);
  if (!accessibleProject) {
    reply.code(404);
    return { error: "not_found" };
  }

  return { members: await listProjectMembers(projectId) };
});

app.post("/projects/:id/members", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.object({
    email: z.string().email(),
    role: z.literal("member").default("member"),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return { error: "invalid_request", message: parsed.error.message };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const result = await addProjectMember(projectId, user.id, parsed.data.email);

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403
      : result.reason === "already_member" ? 409
      : result.reason === "cannot_invite_self" ? 422
      : result.reason === "member_limit_reached" ? 403
      : 400;
    reply.code(status);
    return { error: result.reason };
  }

  reply.code(201);
  return { ok: true, pending: result.reason === "pending" };
});

app.delete("/projects/:id/members", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.union([
    z.object({ user_id: z.string().min(1) }),
    z.object({ pending_email: z.string().email() }),
  ]);
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return { error: "invalid_request", message: parsed.error.message };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const accessibleProject = await getAccessibleProject(user.id, projectId);
  if (!accessibleProject?.permissions.can_update_settings) {
    reply.code(403);
    return { error: "forbidden" };
  }

  if ("pending_email" in parsed.data) {
    await pgPool.query(
      `DELETE FROM pending_project_invites WHERE project_id = $1 AND invitee_email = $2`,
      [projectId, parsed.data.pending_email],
    );
    return { ok: true };
  }

  const result = await removeProjectMember(user.id, projectId, parsed.data.user_id);

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403
      : result.reason === "cannot_remove_owner" ? 422
      : 400;
    reply.code(status);
    return { error: result.reason };
  }

  return { ok: true };
});

process.on("SIGINT", () => void closePools());
process.on("SIGTERM", () => void closePools());

if (
  (process.env.POLAR_ACCESS_TOKEN || process.env.POLAR_PRO_PRODUCT_ID) &&
  !process.env.POLAR_WEBHOOK_SECRET
) {
  throw new Error("POLAR_WEBHOOK_SECRET must be set when Polar billing is enabled");
}

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});