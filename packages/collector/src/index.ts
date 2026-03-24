import Fastify from "fastify";
import { createServer } from "node:net";
import { z } from "zod";
import { classifyTrace } from "./classify.js";
import { normalizeEnvelope, type OtlpEnvelope } from "./otlp.js";
import {
  ensureProject,
  getProjectSettings,
  insertSpans,
  pgPool,
  updateTraceFailures,
  upsertTraceSummary,
} from "./storage.js";

const httpPort = Number(process.env.PORT ?? 4318);
const grpcPort = Number(process.env.GRPC_PORT ?? 4317);

const spanEnvelopeSchema = z.object({
  resourceSpans: z.array(z.unknown()).default([]),
});

const app = Fastify({ logger: true });

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

  const { spans, summaries } = normalizeEnvelope(parsed.data as OtlpEnvelope);

  if (spans.length === 0) {
    reply.code(202);
    return { partialSuccess: {} };
  }

  for (const summary of summaries) {
    await ensureProject(summary.projectId);
  }

  await insertSpans(spans);

  for (const summary of summaries) {
    await upsertTraceSummary(summary);
    const projectSettings = await getProjectSettings(summary.projectId);
    const traceSpans = spans.filter((span) => span.trace_id === summary.traceId);
    const failures = classifyTrace(traceSpans, projectSettings, summary.status);
    await updateTraceFailures(summary.traceId, failures);
  }

  request.log.info(
    {
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
