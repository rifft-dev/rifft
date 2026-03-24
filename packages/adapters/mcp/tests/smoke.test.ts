import test from "node:test";
import assert from "node:assert/strict";
import { init, withSpan } from "../../../sdk-js/src/index.js";
import { instrumentMcpClient } from "../src/index.js";

test("instrumentMcpClient wraps callTool and records MCP attributes", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ partialSuccess: {} }), { status: 202 });
  }) as typeof fetch;

  try {
    init({ project_id: "default", endpoint: "http://localhost:4318" });

    const client = instrumentMcpClient(
      {
        async callTool(payload: { name: string; params: Record<string, unknown>; headers?: Record<string, string> }) {
          assert.ok(payload.headers?.traceparent);
          assert.ok(payload.headers?.["x-rifft-traceparent"]);
          return { ok: true, echoed: payload.params };
        },
      },
      { server_name: "local-mcp", framework: "custom", agent_id: "researcher" },
    );

    await withSpan("agent.run", { agent_id: "researcher", framework: "custom" }, async () => {
      await client.callTool?.({ name: "search_docs", params: { query: "mcp smoke" } });
    });

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0]);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    const toolSpan = spans.find((span: any) => span.name === "tool.call");
    assert.ok(toolSpan);
    const attrs = Object.fromEntries(
      toolSpan.attributes.map((entry: any) => [entry.key, entry.value.stringValue ?? entry.value.doubleValue]),
    );
    assert.equal(attrs["mcp.tool_name"], "search_docs");
    assert.equal(attrs["mcp.server_name"], "local-mcp");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
