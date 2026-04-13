import Fastify from "fastify";
import { createServer } from "node:net";
import { z } from "zod";
import { classifyTrace } from "./classify.js";
import { normalizeEnvelope, type OtlpEnvelope } from "./otlp.js";
import {
  checkProjectIngestAllowance,
  ensureProject,
  getProjectIdForApiKey,
  getProjectSettings,
  insertSpans,
  pgPool,
  pruneProjectRetention,
  updateTraceFailures,
  upsertTraceSummary,
} from "./storage.js";

const httpPort = Number(process.env.PORT ?? 4318);
const grpcPort = Number(process.env.GRPC_PORT ?? 4317);

const spanEnvelopeSchema = z.object({
  resourceSpans: z.array(z.unknown()).default([]),
});

const app = Fastify({ logger: true });

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

app.get("/health", async () => ({
  status: "ok",
  service: "collector",
  transports: {
    http: httpPort,
    grpc: grpcPort,
  },
  storage: {
    postgres: "configured",
    clickhouse: "configured",
  },
}));

app.post("/v1/traces", async (request, reply) => {
  const parsed = spanEnvelopeSchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_otlp_payload",
      message: parsed.error.message,
    };
  }

  const bearerToken = getBearerToken(request.headers.authorization);
  const authenticatedProjectId = bearerToken
    ? await getProjectIdForApiKey(bearerToken)
    : null;

  if (bearerToken && !authenticatedProjectId) {
    reply.code(401);
    return {
      error: "invalid_api_key",
      message: "Collector could not verify the provided Rifft API key.",
    };
  }

  const { spans, summaries } = normalizeEnvelope(parsed.data as OtlpEnvelope, {
    projectIdOverride: authenticatedProjectId,
  });

  if (spans.length === 0) {
    reply.code(400);
    return {
      error: "no_spans_extracted",
      message:
        "The collector accepted the OTLP envelope but could not extract any spans. Check the SDK wiring and payload shape.",
    };
  }

  for (const summary of summaries) {
    await ensureProject(summary.projectId);
  }

  const spansByProject = new Map<string, { spanCount: number; traceIds: Set<string> }>();
  for (const span of spans) {
    const entry = spansByProject.get(span.project_id) ?? { spanCount: 0, traceIds: new Set<string>() };
    entry.spanCount += 1;
    entry.traceIds.add(span.trace_id);
    spansByProject.set(span.project_id, entry);
  }

  for (const [projectId, projectSpans] of spansByProject.entries()) {
    const allowance = await checkProjectIngestAllowance(
      projectId,
      projectSpans.spanCount,
      [...projectSpans.traceIds],
    );

    if (!allowance.allowed) {
      reply.code(429);
      return {
        error: "span_limit_exceeded",
        message:
          allowance.plan_key === "free"
            ? "This Rifft Cloud Free project has reached its monthly span limit. Upgrade to Pro to continue ingesting."
            : "This Rifft Cloud project has reached its monthly span limit.",
        plan: allowance.plan_key,
        usage: {
          current: allowance.current_usage,
          projected: allowance.projected_usage,
          limit: allowance.limit,
        },
      };
    }
  }

  await insertSpans(spans);

  for (const summary of summaries) {
    await upsertTraceSummary(summary);
    const projectSettings = await getProjectSettings(summary.projectId);
    const traceSpans = spans.filter((span) => span.trace_id === summary.traceId);
    const failures = classifyTrace(traceSpans, projectSettings, summary.status);
    await updateTraceFailures(summary.traceId, failures);
    await pruneProjectRetention(summary.projectId, projectSettings.retention_days);
  }

  request.log.info(
    {
      authenticatedProjectId,
      resourceSpanCount: parsed.data.resourceSpans.length,
      storedSpanCount: spans.length,
      traceCount: summaries.length,
    },
    "Accepted and persisted OTLP HTTP trace payload",
  );

  reply.code(202);
  return { partialSuccess: {} };
});

const grpcServer = createServer((socket) => {
  socket.end();
});

const start = async () => {
  await app.listen({ host: "0.0.0.0", port: httpPort });
  grpcServer.listen(grpcPort, "0.0.0.0");
  app.log.info(`Collector HTTP listening on ${httpPort}`);
  app.log.info(`Collector gRPC placeholder listening on ${grpcPort}`);
};

const shutdown = async () => {
  await app.close();
  grpcServer.close();
  await pgPool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
