"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type RuntimeOption = "python" | "node";
type FrameworkOption = "crewai" | "custom" | "mcp";
type PackageManagerOption = "npm" | "pnpm" | "yarn";

const runtimeFrameworks: Record<RuntimeOption, FrameworkOption[]> = {
  python: ["crewai", "custom"],
  node: ["custom", "mcp"],
};

const labels: Record<FrameworkOption, string> = {
  crewai: "CrewAI",
  custom: "Custom",
  mcp: "MCP",
};

const runtimeMeta: Record<RuntimeOption, { title: string; description: string }> = {
  python: {
    title: "Python",
    description: "CrewAI, adapters, and Python custom loops.",
  },
  node: {
    title: "Node.js",
    description: "JavaScript or TypeScript agents, services, and MCP clients.",
  },
};

const frameworkMeta: Record<FrameworkOption, { title: string; description: string }> = {
  crewai: {
    title: "CrewAI",
    description: "Start with the Python CrewAI adapter.",
  },
  custom: {
    title: "Custom",
    description: "Instrument your own agent boundaries directly.",
  },
  mcp: {
    title: "MCP",
    description: "Wrap an MCP client and capture tool calls automatically.",
  },
};

const buildSnippet = (
  runtime: RuntimeOption,
  framework: FrameworkOption,
  packageManager: PackageManagerOption,
) => {
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

  const installCommand =
    packageManager === "pnpm"
      ? framework === "mcp"
        ? "pnpm add @rifft-dev/rifft @rifft-dev/mcp"
        : "pnpm add @rifft-dev/rifft"
      : packageManager === "yarn"
        ? framework === "mcp"
          ? "yarn add @rifft-dev/rifft @rifft-dev/mcp"
          : "yarn add @rifft-dev/rifft"
        : framework === "mcp"
          ? "npm install @rifft-dev/rifft @rifft-dev/mcp"
          : "npm install @rifft-dev/rifft";

  if (framework === "mcp") {
    return `${installCommand}

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

  return `${installCommand}

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
  const [packageManager, setPackageManager] = useState<PackageManagerOption>("npm");
  const [framework, setFramework] = useState<FrameworkOption>("crewai");

  const snippet = useMemo(
    () => buildSnippet(runtime, framework, packageManager),
    [framework, packageManager, runtime],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border bg-muted/15 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          1. Choose runtime
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["python", "node"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                runtime === option
                  ? "border-primary bg-primary/8"
                  : "border-border bg-background hover:bg-muted/40"
              }`}
              onClick={() => {
                setRuntime(option);
                setFramework(runtimeFrameworks[option][0]);
              }}
            >
              <div className="text-sm font-medium">{runtimeMeta[option].title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {runtimeMeta[option].description}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border bg-muted/15 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          2. Choose integration
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {runtimeFrameworks[runtime].map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                framework === option
                  ? "border-primary bg-primary/8"
                  : "border-border bg-background hover:bg-muted/40"
              }`}
              onClick={() => setFramework(option)}
            >
              <div className="text-sm font-medium">{frameworkMeta[option].title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {frameworkMeta[option].description}
              </div>
            </button>
          ))}
        </div>
      </div>
      {runtime === "node" ? (
        <div className="space-y-3 rounded-2xl border bg-muted/15 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            3. Choose package manager
          </div>
          <div className="flex flex-wrap gap-2">
            {(["npm", "pnpm", "yarn"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={packageManager === option ? "default" : "outline"}
                size="sm"
                onClick={() => setPackageManager(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {runtime === "python" ? "3. Run this snippet" : "4. Run this snippet"}
        </div>
        <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-sm">
          {snippet}
        </pre>
      </div>
      <div className="text-sm text-muted-foreground">
        Then run one real workflow and open the first trace in Rifft.
      </div>
    </div>
  );
}
