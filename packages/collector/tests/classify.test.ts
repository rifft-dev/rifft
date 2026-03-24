import test from "node:test";
import assert from "node:assert/strict";
import { classifyTrace } from "../src/classify.js";

type SpanRecord = Parameters<typeof classifyTrace>[0][number];

const project = {
  cost_threshold_usd: 0,
  timeout_threshold_ms: 0,
};

const makeSpan = (overrides: Partial<SpanRecord>): SpanRecord => ({
  trace_id: "trace-1",
  span_id: "span-1",
  parent_span_id: null,
  name: "agent.execute",
  start_time: "2026-03-24T12:00:00.000Z",
  end_time: "2026-03-24T12:00:01.000Z",
  duration_ms: 1000,
  status: "ok",
  attributes: "{}",
  events: "[]",
  resource: "{}",
  agent_id: "researcher",
  framework: "crewai",
  project_id: "default",
  ...overrides,
});

test("classifyTrace flags ambiguous task descriptions", () => {
  const failures = classifyTrace(
    [
      makeSpan({
        attributes: JSON.stringify({
          "crewai.task": "Help",
        }),
      }),
    ],
    project,
    "ok",
  );

  assert.equal(failures.some((failure) => failure.mode === "ambiguous_task_description"), true);
});

test("classifyTrace flags context window overflow", () => {
  const failures = classifyTrace(
    [
      makeSpan({
        attributes: JSON.stringify({
          token_count: 12000,
          context_limit: 8000,
        }),
      }),
    ],
    project,
    "error",
  );

  const overflow = failures.find((failure) => failure.mode === "context_window_overflow");
  assert.ok(overflow);
  assert.equal(overflow.severity, "fatal");
});

test("classifyTrace flags unverified information propagation", () => {
  const failures = classifyTrace(
    [
      makeSpan({
        span_id: "root",
        name: "crew.kickoff",
        agent_id: "orchestrator",
        start_time: "2026-03-24T12:00:00.000Z",
        end_time: "2026-03-24T12:00:05.000Z",
      }),
      makeSpan({
        span_id: "source",
        parent_span_id: "root",
        agent_id: "researcher",
        start_time: "2026-03-24T12:00:00.100Z",
        end_time: "2026-03-24T12:00:01.000Z",
      }),
      makeSpan({
        span_id: "comm",
        parent_span_id: "root",
        name: "rifft.agent_to_agent",
        agent_id: "researcher",
        start_time: "2026-03-24T12:00:01.100Z",
        end_time: "2026-03-24T12:00:01.200Z",
        attributes: JSON.stringify({
          source_agent_id: "researcher",
          target_agent_id: "writer",
          message: "Draft findings",
        }),
      }),
      makeSpan({
        span_id: "target",
        parent_span_id: "root",
        agent_id: "writer",
        start_time: "2026-03-24T12:00:01.250Z",
        end_time: "2026-03-24T12:00:02.000Z",
        status: "error",
      }),
    ],
    project,
    "error",
  );

  const propagation = failures.find((failure) => failure.mode === "unverified_information_propagation");
  assert.ok(propagation);
  assert.equal(propagation.agent_id, "researcher");
});

test("classifyTrace flags incorrect termination condition when root span ends too early", () => {
  const failures = classifyTrace(
    [
      makeSpan({
        span_id: "root",
        name: "crew.kickoff",
        agent_id: "orchestrator",
        start_time: "2026-03-24T12:00:00.000Z",
        end_time: "2026-03-24T12:00:01.000Z",
      }),
      makeSpan({
        span_id: "child",
        parent_span_id: "root",
        agent_id: "writer",
        start_time: "2026-03-24T12:00:00.500Z",
        end_time: "2026-03-24T12:00:02.000Z",
      }),
    ],
    project,
    "error",
  );

  const termination = failures.find((failure) => failure.mode === "incorrect_termination_condition");
  assert.ok(termination);
  assert.equal(termination.severity, "fatal");
});

test("classifyTrace attaches missing output validation to the downstream agent after the last communication", () => {
  const failures = classifyTrace(
    [
      makeSpan({
        span_id: "root",
        name: "crew.kickoff",
        agent_id: "orchestrator",
        start_time: "2026-03-24T12:00:00.000Z",
        end_time: "2026-03-24T12:00:05.000Z",
      }),
      makeSpan({
        span_id: "source",
        parent_span_id: "root",
        agent_id: "researcher",
        start_time: "2026-03-24T12:00:00.100Z",
        end_time: "2026-03-24T12:00:01.000Z",
      }),
      makeSpan({
        span_id: "handoff",
        parent_span_id: "root",
        name: "rifft.agent_to_agent",
        agent_id: "researcher",
        start_time: "2026-03-24T12:00:01.100Z",
        end_time: "2026-03-24T12:00:01.200Z",
        attributes: JSON.stringify({
          source_agent_id: "researcher",
          target_agent_id: "writer",
          message: "Draft findings",
        }),
      }),
      makeSpan({
        span_id: "target",
        parent_span_id: "root",
        agent_id: "writer",
        start_time: "2026-03-24T12:00:01.250Z",
        end_time: "2026-03-24T12:00:02.000Z",
      }),
    ],
    project,
    "ok",
  );

  const validation = failures.find((failure) => failure.mode === "missing_output_validation");
  assert.ok(validation);
  assert.equal(validation.agent_id, "writer");
});
