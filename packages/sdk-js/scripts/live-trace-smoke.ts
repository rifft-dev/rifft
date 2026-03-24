import { init, trace, withSpan } from "../src/index.js";

const testId = `sdk-js-smoke-${Math.random().toString(16).slice(2, 10)}`;

init({
  project_id: "default",
  endpoint: "http://localhost:4318",
});

const researcher = trace({
  agent_id: "researcher",
  framework: "custom",
  span_name: "agent.research",
})(async function researcherAgent(query: string) {
  return withSpan("tool.call", { agent_id: "researcher", framework: "custom" }, async (span) => {
    span.setAttribute("tool.name", "web_search");
    span.setAttribute("tool.input", query);
    span.captureDecision({
      system_prompt: "Collect sources",
      conversation_history: [{ role: "user", content: query }],
      available_tools: ["web_search"],
      chosen_action: "web_search",
    });
    return ["source-a", "source-b"];
  });
});

const writer = trace({
  agent_id: "writer",
  framework: "custom",
  span_name: "agent.write",
})(async function writerAgent(sources: string[]) {
  return withSpan("agent.compose", { agent_id: "writer", framework: "custom" }, async (span) => {
    span.setAttribute("input", { sources });
    span.setAttribute("trace.test_id", testId);
    return `summary:${sources.length}`;
  });
});

const main = async () => {
  const result = await withSpan("sdk.js.smoke.root", { agent_id: "orchestrator", framework: "custom" }, async (span) => {
    span.setAttribute("trace.test_id", testId);
    const sources = await researcher(`Investigate ${testId}`);
    const summary = await writer(sources);
    await withSpan("output.validate", { agent_id: "orchestrator", framework: "custom" }, async (validationSpan) => {
      validationSpan.setAttribute("validation.passed", summary.startsWith("summary:"));
      validationSpan.setAttribute("validation.output", summary);
    });
    return summary;
  });

  console.log(testId);
  console.log(result);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
