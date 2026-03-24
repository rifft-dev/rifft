import Fastify from "fastify";
import { z } from "zod";
import { closePools } from "./db.js";
import {
  createProject,
  getProject,
  getAgentDetail,
  listForkDrafts,
  getTrace,
  getTraceGraph,
  getTraceTimeline,
  listProjects,
  listTraces,
  upsertForkDraft,
  updateProjectSettings,
} from "./queries.js";

const port = Number(process.env.PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL ?? "";
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? "";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "api",
  dependencies: {
    postgresConfigured: databaseUrl.length > 0,
    clickhouseConfigured: clickhouseUrl.length > 0,
    supabaseConfigured: supabaseUrl.length > 0,
  },
}));

app.get("/projects", async () => ({
  projects: await listProjects(),
}));

app.get("/projects/:id", async (request, reply) => {
  const project = await getProject((request.params as { id: string }).id);
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

app.patch("/projects/:id", async (request, reply) => {
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

  const project = await updateProjectSettings((request.params as { id: string }).id, parsed.data);
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.get("/projects/:id/traces", async (request, reply) => {
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

  const result = await listTraces({
    projectId: (request.params as { id: string }).id,
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
  const trace = await getTrace((request.params as { traceId: string }).traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  return trace;
});

app.get("/traces/:traceId/graph", async (request, reply) => {
  const graph = await getTraceGraph((request.params as { traceId: string }).traceId);
  if (!graph) {
    reply.code(404);
    return { error: "not_found" };
  }

  return graph;
});

app.get("/traces/:traceId/timeline", async (request, reply) => {
  const timeline = await getTraceTimeline((request.params as { traceId: string }).traceId);
  if (!timeline) {
    reply.code(404);
    return { error: "not_found" };
  }

  return timeline;
});

app.get("/traces/:traceId/fork-drafts", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
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
  const detail = await getAgentDetail(params.traceId, params.agentId);
  if (!detail) {
    reply.code(404);
    return { error: "not_found" };
  }

  return detail;
});

process.on("SIGINT", () => void closePools());
process.on("SIGTERM", () => void closePools());

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
