import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { readConfig, replayFromPayload } from "./workflow.js";

const port = Number(process.env.RIFFT_REPLAY_PORT ?? 8787);
const config = readConfig();

const readRequestBody = (request: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const server = createServer(async (request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/rifft/replay") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request)) as {
      trace_id?: string;
      span_id?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.payload || typeof body.payload !== "object") {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_payload" }));
      return;
    }

    const result = await replayFromPayload(body.payload, config);
    response.writeHead(result.status === "passed" ? 200 : 422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ...result,
        source_trace_id: body.trace_id ?? null,
        source_span_id: body.span_id ?? null,
      }),
    );
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

server.listen(port, () => {
  console.log(`Rifft replay hook listening on http://localhost:${port}/rifft/replay`);
});
