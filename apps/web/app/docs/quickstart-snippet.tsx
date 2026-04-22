"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type RuntimeOption = "python" | "node";
type FrameworkOption = "crewai" | "custom" | "mcp";

const runtimeFrameworks: Record<RuntimeOption, FrameworkOption[]> = {
  python: ["crewai", "custom"],
  node: ["custom", "mcp"],
};

const labels: Record<FrameworkOption, string> = {
  crewai: "CrewAI",
  custom: "Custom",
  mcp: "MCP",
};

const buildSnippet = (runtime: RuntimeOption, framework: FrameworkOption) => {
  if (runtime === "python") {
    return framework === "crewai"
      ? `pip install rifft-sdk rifft-crewai

import rifft

rifft.init(
  project_id="proj_your_project_id",
  endpoint="https://ingest.rifft.dev",
  api_key="rft_live_xxxxx",
)`
      : `pip install rifft-sdk

import rifft

rifft.init(
  project_id="proj_your_project_id",
  endpoint="https://ingest.rifft.dev",
  api_key="rft_live_xxxxx",
)`;
  }

  if (framework === "mcp") {
    return `npm install @rifft-dev/rifft @rifft-dev/mcp

import { init } from "@rifft-dev/rifft";
import { instrumentMcpClient } from "@rifft-dev/mcp";

init({
  project_id: "proj_your_project_id",
  endpoint: "https://ingest.rifft.dev",
  api_key: "rft_live_xxxxx",
});

const tracedClient = instrumentMcpClient(mcpClient, {
  agent_id: "mcp-client",
  server_name: "my-mcp-server",
});`;
  }

  return `npm install @rifft-dev/rifft

import { init, withSpan } from "@rifft-dev/rifft";

init({
  project_id: "proj_your_project_id",
  endpoint: "https://ingest.rifft.dev",
  api_key: "rft_live_xxxxx",
});

await withSpan("agent.run", { agent_id: "orchestrator", framework: "custom" }, async () => {
  // your agent logic here
});`;
};

export function QuickstartSnippet() {
  const [runtime, setRuntime] = useState<RuntimeOption>("python");
  const [framework, setFramework] = useState<FrameworkOption>("crewai");

  const snippet = useMemo(() => buildSnippet(runtime, framework), [framework, runtime]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["python", "node"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant={runtime === option ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setRuntime(option);
              setFramework(runtimeFrameworks[option][0]);
            }}
          >
            {option === "python" ? "Python" : "Node.js"}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {runtimeFrameworks[runtime].map((option) => (
          <Button
            key={option}
            type="button"
            variant={framework === option ? "default" : "outline"}
            size="sm"
            onClick={() => setFramework(option)}
          >
            {labels[option]}
          </Button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-sm">
        {snippet}
      </pre>
      <div className="text-sm text-muted-foreground">
        Then run one real workflow and open the first trace in Rifft.
      </div>
    </div>
  );
}
