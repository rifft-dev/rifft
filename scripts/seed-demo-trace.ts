import { execFileSync } from "node:child_process";

const postgresContainer = process.env.RIFFT_POSTGRES_CONTAINER ?? "rifft-postgres";
const clickhouseContainer = process.env.RIFFT_CLICKHOUSE_CONTAINER ?? "rifft-clickhouse";
const postgresUser = process.env.POSTGRES_USER ?? "rifft";
const postgresDb = process.env.POSTGRES_DB ?? "rifft";

const traceId = "demo202603260001feedfacecafebeef";

type SeedSpan = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  attributes: Record<string, unknown>;
  events: unknown[];
  resource: Record<string, unknown>;
  agent_id: string;
  framework: string;
  project_id: string;
};

const escapeSql = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "''");

const toClickHouseDateTime64 = (value: string) => {
  const [datePart, timePartWithZone = "00:00:00.000Z"] = value.split("T");
  const timePart = timePartWithZone.replace("Z", "");
  const [clock = "00:00:00", fraction = ""] = timePart.split(".");
  const paddedFraction = `${fraction}000000000`.slice(0, 9);
  return `${datePart} ${clock}.${paddedFraction}`;
};

const sqlValue = (value: string | number | null) => {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }

  return `'${escapeSql(value)}'`;
};

const runPostgresSql = (sql: string) => {
  execFileSync(
    "docker",
    ["exec", "-i", postgresContainer, "psql", "-U", postgresUser, "-d", postgresDb, "-v", "ON_ERROR_STOP=1"],
    {
      input: sql,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
};

const runClickHouseQuery = (query: string) => {
  execFileSync(
    "docker",
    ["exec", "-i", clickhouseContainer, "clickhouse-client", "--query", query],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
};

const traceStart = new Date();
traceStart.setSeconds(traceStart.getSeconds() - 90);

const orchestratorStart = traceStart;
const orchestratorEnd = new Date(orchestratorStart.getTime() + 800);
const researcherStart = new Date(orchestratorEnd.getTime());
const researcherEnd = new Date(researcherStart.getTime() + 2400);
const handoffBriefStart = new Date(researcherStart.getTime() + 2140);
const handoffBriefEnd = new Date(handoffBriefStart.getTime() + 90);
const handoffSourcesStart = new Date(researcherStart.getTime() + 2280);
const handoffSourcesEnd = new Date(handoffSourcesStart.getTime() + 120);
const writerStart = new Date(researcherEnd.getTime());
const writerEnd = new Date(writerStart.getTime() + 1200);

const resource = {
  "service.name": "rifft-demo-seed",
  "deployment.environment": "local-demo",
};

const spans: SeedSpan[] = [
  {
    trace_id: traceId,
    span_id: "a100000000000001",
    parent_span_id: null,
    name: "crew.kickoff",
    start_time: orchestratorStart.toISOString(),
    end_time: orchestratorEnd.toISOString(),
    duration_ms: 800,
    status: "ok",
    attributes: {
      project_id: "default",
      agent_id: "orchestrator",
      framework: "crewai",
      "crewai.task": "Coordinate the research and drafting workflow into a launch-ready incident brief for the team.",
      "crewai.agent_role": "orchestrator",
      "rifft.decision": {
        system_prompt: "Route work between specialist agents and keep the output concise, credible, and launch-ready.",
        conversation_history: [
          {
            role: "user",
            content: "Produce a polished incident brief with verified findings and an executive summary.",
          },
        ],
        available_tools: ["delegate_research", "delegate_writing"],
        chosen_action: "delegate_research",
        reasoning: "The workflow needs grounded findings before the writer can produce a credible brief.",
      },
    },
    events: [],
    resource,
    agent_id: "orchestrator",
    framework: "crewai",
    project_id: "default",
  },
  {
    trace_id: traceId,
    span_id: "b200000000000002",
    parent_span_id: "a100000000000001",
    name: "agent.execute",
    start_time: researcherStart.toISOString(),
    end_time: researcherEnd.toISOString(),
    duration_ms: 2400,
    status: "ok",
    attributes: {
      project_id: "default",
      agent_id: "researcher",
      framework: "crewai",
      "crewai.task":
        "Research three high-signal findings about the incident, gather supporting evidence, and prepare concise notes for the writer.",
      "crewai.agent_role": "researcher",
      "llm.input_tokens": 2831,
      "llm.output_tokens": 741,
      "cost_usd": 0.0041,
      "tool.name": "web_search",
      "tool.input": {
        queries: ["ai incident propagation validation failure", "workflow debugging best practices"],
      },
      "tool.output": {
        highlights: [
          "Cross-agent failures are often caused by unchecked handoffs.",
          "Validation steps reduce downstream hallucination risk.",
        ],
      },
      "rifft.decision": {
        system_prompt: "You are a research specialist. Gather concise, evidence-backed findings for downstream agents.",
        conversation_history: [
          {
            role: "system",
            content: "Find strong evidence quickly and pass only the most actionable notes.",
          },
          {
            role: "user",
            content: "We need three findings for a launch demo incident brief.",
          },
        ],
        available_tools: ["web_search", "source_note_builder"],
        chosen_action: "web_search",
        reasoning: "The writer needs short, high-confidence findings with supporting notes.",
      },
    },
    events: [
      {
        name: "research.completed",
        time: researcherEnd.toISOString(),
        attributes: {
          findings_count: 3,
          evidence_quality: "mixed",
        },
      },
    ],
    resource,
    agent_id: "researcher",
    framework: "crewai",
    project_id: "default",
  },
  {
    trace_id: traceId,
    span_id: "c300000000000003",
    parent_span_id: "b200000000000002",
    name: "rifft.agent_to_agent",
    start_time: handoffBriefStart.toISOString(),
    end_time: handoffBriefEnd.toISOString(),
    duration_ms: 90,
    status: "ok",
    attributes: {
      project_id: "default",
      framework: "crewai",
      source_agent_id: "researcher",
      target_agent_id: "writer",
      protocol: "agent_to_agent",
      message: {
        type: "research_brief",
        summary:
          "Three findings suggest the failure spread because the writer trusted an unverified intermediate note.",
        claims: [
          "The upstream note claimed the issue was confirmed by two sources.",
          "The note was not actually validated before handoff.",
        ],
      },
    },
    events: [],
    resource,
    agent_id: "unknown",
    framework: "crewai",
    project_id: "default",
  },
  {
    trace_id: traceId,
    span_id: "d400000000000004",
    parent_span_id: "b200000000000002",
    name: "rifft.agent_to_agent",
    start_time: handoffSourcesStart.toISOString(),
    end_time: handoffSourcesEnd.toISOString(),
    duration_ms: 120,
    status: "ok",
    attributes: {
      project_id: "default",
      framework: "crewai",
      source_agent_id: "researcher",
      target_agent_id: "writer",
      protocol: "agent_to_agent",
      message: {
        type: "source_notes",
        citations: [
          { title: "Postmortem excerpt", confidence: "medium" },
          { title: "Ops chat summary", confidence: "low" },
        ],
        warning: "Source confidence is mixed and needs review before publication.",
      },
    },
    events: [],
    resource,
    agent_id: "unknown",
    framework: "crewai",
    project_id: "default",
  },
  {
    trace_id: traceId,
    span_id: "e500000000000005",
    parent_span_id: "a100000000000001",
    name: "agent.execute",
    start_time: writerStart.toISOString(),
    end_time: writerEnd.toISOString(),
    duration_ms: 1200,
    status: "error",
    attributes: {
      project_id: "default",
      agent_id: "writer",
      framework: "crewai",
      "crewai.task":
        "Draft the incident brief using the researcher's notes and publish a concise summary for the launch review.",
      "crewai.agent_role": "writer",
      "llm.input_tokens": 1744,
      "llm.output_tokens": 512,
      "cost_usd": 0.0028,
      "error.message": "Draft included an unsupported claim from the research brief.",
      "output.draft": {
        headline: "Unchecked agent handoffs caused the incident to spread.",
        summary:
          "The draft states the claim was independently verified, but no validation span confirms that evidence.",
      },
      "rifft.decision": {
        system_prompt: "You are a writer. Turn research notes into a concise launch-ready brief.",
        conversation_history: [
          {
            role: "assistant",
            content: "Received research brief and source notes from researcher.",
          },
        ],
        available_tools: ["outline_brief", "finalize_copy"],
        chosen_action: "finalize_copy",
        reasoning: "The research brief looked complete enough to draft immediately, but it lacked a validation step.",
      },
    },
    events: [
      {
        name: "draft.rejected",
        time: writerEnd.toISOString(),
        attributes: {
          reason: "unsupported_claim",
          severity: "fatal",
        },
      },
    ],
    resource,
    agent_id: "writer",
    framework: "crewai",
    project_id: "default",
  },
];

const mastFailures = [
  {
    mode: "unverified_information_propagation",
    severity: "fatal",
    agent_id: "writer",
    explanation:
      "Writer relied on the researcher's handoff without a validation step, so an unsupported claim propagated into the final draft and caused the run to fail.",
  },
  {
    mode: "missing_output_validation",
    severity: "benign",
    agent_id: "writer",
    explanation:
      "The writer produced a final draft without any explicit review, schema check, or verifier span before completion.",
  },
  {
    mode: "ambiguous_task_description",
    severity: "benign",
    agent_id: "orchestrator",
    explanation:
      "The orchestration brief asked for a launch-ready brief but did not spell out the exact sections, evidence standard, or acceptance criteria.",
  },
];

const totalCostUsd = 0.0041 + 0.0028;

const postgresInsert = `
BEGIN;
INSERT INTO projects (id, name, api_key)
VALUES ('default', 'Default Project', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (id) DO NOTHING;

DELETE FROM traces WHERE trace_id = '${escapeSql(traceId)}';

INSERT INTO traces (
  trace_id,
  project_id,
  root_span_name,
  started_at,
  ended_at,
  duration_ms,
  status,
  framework,
  agent_count,
  span_count,
  total_cost_usd,
  mast_failures
)
VALUES (
  '${escapeSql(traceId)}',
  'default',
  'crew.kickoff',
  '${escapeSql(orchestratorStart.toISOString())}',
  '${escapeSql(writerEnd.toISOString())}',
  4400,
  'error',
  ARRAY['crewai']::text[],
  3,
  ${spans.length},
  ${totalCostUsd},
  '${escapeSql(JSON.stringify(mastFailures))}'::jsonb
);
COMMIT;
`;

const clickhouseDelete = `
  DELETE FROM rifft.spans
  WHERE trace_id = ${sqlValue(traceId)}
  SETTINGS mutations_sync = 1
`;

const clickhouseValues = spans
  .map((span) =>
    [
      sqlValue(span.trace_id),
      sqlValue(span.span_id),
      sqlValue(span.parent_span_id),
      sqlValue(span.name),
      sqlValue(toClickHouseDateTime64(span.start_time)),
      sqlValue(toClickHouseDateTime64(span.end_time)),
      sqlValue(span.duration_ms),
      sqlValue(span.status),
      sqlValue(JSON.stringify(span.attributes)),
      sqlValue(JSON.stringify(span.events)),
      sqlValue(JSON.stringify(span.resource)),
      sqlValue(span.agent_id),
      sqlValue(span.framework),
      sqlValue(span.project_id),
    ].join(", "),
  )
  .map((tuple) => `(${tuple})`)
  .join(",\n");

const clickhouseInsert = `
  INSERT INTO rifft.spans
  (trace_id, span_id, parent_span_id, name, start_time, end_time, duration_ms, status, attributes, events, resource, agent_id, framework, project_id)
  VALUES
  ${clickhouseValues}
`;

runClickHouseQuery(clickhouseDelete);
runClickHouseQuery(clickhouseInsert);
runPostgresSql(postgresInsert);

console.log("");
console.log("Seeded Rifft demo trace successfully.");
console.log(`Trace ID: ${traceId}`);
console.log("Agents: orchestrator, researcher, writer");
console.log("Durations: orchestrator 800ms, researcher 2400ms, writer 1200ms");
console.log("Costs: researcher $0.0041, writer $0.0028");
console.log("MAST failures: 3 (including fatal unverified_information_propagation)");
console.log(`Open: http://localhost:3000/traces/${traceId}`);
