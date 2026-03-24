import { init, withSpan } from "../../../sdk-js/src/index.js";
import { instrumentMcpClient } from "../src/index.js";

const testId = `mcp-smoke-${Math.random().toString(16).slice(2, 10)}`;

init({
  project_id: "default",
  endpoint: "http://localhost:4318",
});

const client = instrumentMcpClient(
  {
    async callTool(payload: { name: string; params: Record<string, unknown>; headers?: Record<string, string> }) {
      return {
        server: "local-mcp",
        tool: payload.name,
        traceparent: payload.headers?.traceparent ?? null,
        result: `ok:${testId}`,
      };
    },
  },
  {
    server_name: "local-mcp",
    framework: "custom",
    agent_id: "researcher",
  },
);

await withSpan("mcp.smoke.root", { agent_id: "orchestrator", framework: "custom" }, async (rootSpan) => {
  rootSpan.setAttribute("trace.test_id", testId);
  const result = await client.callTool?.({
    name: "search_docs",
    params: { query: `Investigate ${testId}` },
  });
  await withSpan("output.validate", { agent_id: "orchestrator", framework: "custom" }, async (validationSpan) => {
    validationSpan.setAttribute("validation.passed", Boolean(result?.result));
    validationSpan.setAttribute("validation.output", result ?? null);
  });
});

console.log(testId);
