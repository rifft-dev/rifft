type SpanRecord = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  attributes: string;
  events: string;
  resource: string;
  agent_id: string;
  framework: string;
  project_id: string;
};

type ProjectSettings = {
  cost_threshold_usd: number;
  timeout_threshold_ms: number;
};

export type MastFailure = {
  mode:
    | "ambiguous_task_description"
    | "agent_communication_failure"
    | "context_window_overflow"
    | "incorrect_termination_condition"
    | "missing_output_validation"
    | "cost_overrun"
    | "timeout_exceeded"
    | "infinite_loop_risk"
    | "unverified_information_propagation";
  severity: "benign" | "fatal";
  agent_id: string | null;
  explanation: string;
};

type ParsedSpan = Omit<SpanRecord, "attributes" | "events" | "resource"> & {
  attributes: Record<string, unknown>;
  events: unknown[];
  resource: Record<string, unknown>;
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseSpan = (span: SpanRecord): ParsedSpan => ({
  ...span,
  attributes: parseJson<Record<string, unknown>>(span.attributes, {}),
  events: parseJson<unknown[]>(span.events, []),
  resource: parseJson<Record<string, unknown>>(span.resource, {}),
});

const severityFor = (
  traceStatus: "ok" | "error" | "unset",
  predicate: boolean,
): "benign" | "fatal" => (traceStatus === "error" || predicate ? "fatal" : "benign");

const hasValidationName = (value: string) => /validat|verify|check|assert|schema/i.test(value);
const isToolLikeSpan = (span: ParsedSpan) =>
  typeof span.attributes["tool.name"] === "string" ||
  typeof span.attributes["mcp.tool_name"] === "string" ||
  /^tool[.:]/i.test(span.name);
const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const getTextAttribute = (attributes: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

export const classifyTrace = (
  spans: SpanRecord[],
  project: ProjectSettings,
  traceStatus: "ok" | "error" | "unset",
): MastFailure[] => {
  const parsed = spans.map(parseSpan).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const failures: MastFailure[] = [];
  const communicationSpans = parsed.filter(
    (span) =>
      typeof span.attributes["source_agent_id"] === "string" &&
      typeof span.attributes["target_agent_id"] === "string",
  );
  const executionSpans = parsed.filter((span) => !communicationSpans.includes(span));

  const totalCost = executionSpans.reduce((sum, span) => {
    const value = span.attributes["cost_usd"] ?? span.attributes["llm.cost_usd"] ?? 0;
    const numeric = typeof value === "number" ? value : Number(value);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  for (const span of executionSpans) {
    if (span.agent_id === "unknown") {
      continue;
    }

    const taskDescription = getTextAttribute(
      span.attributes,
      "crewai.task",
      "task",
      "task.description",
      "input",
      "prompt",
    );
    if (taskDescription && taskDescription.length < 12) {
      failures.push({
        mode: "ambiguous_task_description",
        severity: severityFor(traceStatus, span.status === "error"),
        agent_id: span.agent_id,
        explanation: `Agent ${span.agent_id} received a very short or underspecified task: "${taskDescription}".`,
      });
    }

    const tokenCount =
      toNumber(span.attributes["token_count"]) ??
      toNumber(span.attributes["input_token_count"]) ??
      toNumber(span.attributes["llm.input_tokens"]) ??
      toNumber(span.attributes["prompt_tokens"]);
    const contextLimit =
      toNumber(span.attributes["context_limit"]) ??
      toNumber(span.attributes["model_context_limit"]) ??
      toNumber(span.attributes["token_limit"]);

    if (
      span.agent_id !== "unknown" &&
      tokenCount !== null &&
      contextLimit !== null &&
      contextLimit > 0 &&
      tokenCount > contextLimit
    ) {
      failures.push({
        mode: "context_window_overflow",
        severity: severityFor(traceStatus, span.status === "error"),
        agent_id: span.agent_id,
        explanation: `Agent ${span.agent_id} received ${tokenCount} tokens against a context limit of ${contextLimit}.`,
      });
    }
  }

  if (project.cost_threshold_usd > 0 && totalCost > project.cost_threshold_usd) {
    const expensiveSpan = executionSpans.reduce<ParsedSpan | null>((winner, span) => {
      const value = span.attributes["cost_usd"] ?? span.attributes["llm.cost_usd"] ?? 0;
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        return winner;
      }

      if (!winner) {
        return span;
      }

      const winnerCost = Number(winner.attributes["cost_usd"] ?? winner.attributes["llm.cost_usd"] ?? 0);
      return numeric > winnerCost ? span : winner;
    }, null);

    failures.push({
      mode: "cost_overrun",
      severity: severityFor(traceStatus, false),
      agent_id: expensiveSpan?.agent_id === "unknown" ? null : (expensiveSpan?.agent_id ?? null),
      explanation: `Trace cost ${totalCost.toFixed(4)} exceeded project threshold ${project.cost_threshold_usd.toFixed(4)}.`,
    });
  }

  if (project.timeout_threshold_ms > 0) {
    for (const span of executionSpans) {
      if (span.agent_id === "unknown" || span.duration_ms <= project.timeout_threshold_ms) {
        continue;
      }

      failures.push({
        mode: "timeout_exceeded",
        severity: severityFor(traceStatus, span.status === "error"),
        agent_id: span.agent_id,
        explanation: `Agent duration ${span.duration_ms}ms exceeded project threshold ${project.timeout_threshold_ms}ms.`,
      });
    }
  }

  for (const span of communicationSpans) {
    const sourceAgentId = span.attributes["source_agent_id"];
    const targetAgentId = span.attributes["target_agent_id"];

    if (typeof sourceAgentId !== "string" || typeof targetAgentId !== "string") {
      continue;
    }

    const receiveCandidate = executionSpans.find(
      (candidate) =>
        candidate.agent_id === targetAgentId &&
        new Date(candidate.start_time).getTime() >= new Date(span.start_time).getTime(),
    );

    if (!receiveCandidate) {
      failures.push({
        mode: "agent_communication_failure",
        severity: severityFor(traceStatus, true),
        agent_id: targetAgentId,
        explanation: `Message from ${sourceAgentId} to ${targetAgentId} has no downstream receive/execution span.`,
      });
      continue;
    }

    const validationBeforeReceive = executionSpans.find((candidate) => {
      const candidateStart = new Date(candidate.start_time).getTime();
      const messageEnd = new Date(span.end_time).getTime();
      const receiveStart = new Date(receiveCandidate.start_time).getTime();
      return (
        candidateStart >= messageEnd &&
        candidateStart <= receiveStart &&
        (hasValidationName(candidate.name) ||
          hasValidationName(String(candidate.attributes["tool.name"] ?? "")) ||
          hasValidationName(String(candidate.attributes["mcp.tool_name"] ?? "")))
      );
    });

    if (!validationBeforeReceive && (traceStatus === "error" || receiveCandidate.status === "error")) {
      failures.push({
        mode: "unverified_information_propagation",
        severity: severityFor(traceStatus, receiveCandidate.status === "error"),
        agent_id: sourceAgentId,
        explanation: `Output from ${sourceAgentId} was passed to ${targetAgentId} without an intermediate validation step.`,
      });
    }
  }

  const rootSpan = [...parsed]
    .filter((span) => span.parent_span_id === null)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
  const latestEndTime = parsed.reduce(
    (latest, span) => Math.max(latest, new Date(span.end_time).getTime()),
    0,
  );

  if (rootSpan && new Date(rootSpan.end_time).getTime() < latestEndTime) {
    failures.push({
      mode: "incorrect_termination_condition",
      severity: severityFor(traceStatus, true),
      agent_id: rootSpan.agent_id === "unknown" ? null : rootSpan.agent_id,
      explanation: `Root span ${rootSpan.name} completed before all downstream spans finished.`,
    });
  }

  const parentSpanIds = new Set(
    executionSpans.map((span) => span.parent_span_id).filter((value): value is string => Boolean(value)),
  );
  const lastCommunicationSpan = [...communicationSpans].sort(
    (a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime(),
  )[0];
  const finalSpanCandidates = [...executionSpans]
    .filter((span) => span.agent_id !== "unknown")
    .filter((span) => !isToolLikeSpan(span))
    .filter((span) => !parentSpanIds.has(span.span_id));

  const downstreamFinalSpan =
    typeof lastCommunicationSpan?.attributes["target_agent_id"] === "string"
      ? finalSpanCandidates
          .filter((span) => span.agent_id === lastCommunicationSpan.attributes["target_agent_id"])
          .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())[0]
      : undefined;

  const finalSpan =
    downstreamFinalSpan ??
    finalSpanCandidates.sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())[0];

  if (finalSpan) {
    const laterValidation = executionSpans.find(
      (candidate) =>
        new Date(candidate.start_time).getTime() >= new Date(finalSpan.end_time).getTime() &&
        (hasValidationName(candidate.name) ||
          hasValidationName(String(candidate.attributes["tool.name"] ?? "")) ||
          hasValidationName(String(candidate.attributes["mcp.tool_name"] ?? ""))),
    );

    if (!laterValidation) {
      failures.push({
        mode: "missing_output_validation",
        severity: severityFor(traceStatus, false),
        agent_id: finalSpan.agent_id === "unknown" ? null : finalSpan.agent_id,
        explanation: `Final agent output from ${finalSpan.agent_id} completed without a subsequent validation step.`,
      });
    }
  }

  const groupedByAgent = new Map<string, ParsedSpan[]>();
  for (const span of executionSpans) {
    if (span.agent_id === "unknown") {
      continue;
    }

    groupedByAgent.set(span.agent_id, [...(groupedByAgent.get(span.agent_id) ?? []), span]);
  }

  for (const [agentId, agentSpans] of groupedByAgent.entries()) {
    const signatureCounts = new Map<string, number>();
    for (const span of agentSpans) {
      const inputSignature = JSON.stringify(
        span.attributes["input"] ?? span.attributes["task"] ?? span.attributes["message"] ?? null,
      );
      const signature = `${span.name}::${inputSignature}`;
      signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
    }

    const repeated = [...signatureCounts.entries()].find(([, count]) => count > 3);
    if (repeated) {
      failures.push({
        mode: "infinite_loop_risk",
        severity: severityFor(traceStatus, false),
        agent_id: agentId,
        explanation: `Agent ${agentId} repeated the same execution pattern more than 3 times.`,
      });
    }
  }

  const deduped = new Map<string, MastFailure>();
  for (const failure of failures) {
    const key = `${failure.mode}:${failure.agent_id ?? "trace"}`;
    if (!deduped.has(key)) {
      deduped.set(key, failure);
    }
  }

  return [...deduped.values()];
};
