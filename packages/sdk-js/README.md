# rifft

TypeScript SDK for Rifft, the cross-framework debugger for multi-agent AI systems.

## Install

```bash
npm install @rifft-dev/rifft
```

## Quickstart

```ts
import { init, trace, withSpan } from "rifft";

init({
  project_id: "my-project",
  endpoint: "http://localhost:4318",
});

const runResearch = trace({
  agent_id: "researcher",
  framework: "custom",
  span_name: "agent.research",
})(async (query: string) => {
  await withSpan("tool.call", { agent_id: "researcher", framework: "custom" }, async (span) => {
    span.setAttribute("tool.name", "search_docs");
    span.setAttribute("tool.input", { query });
  });

  return { ok: true };
});
```
