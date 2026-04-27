export type MastMode =
  | "missing_error_handling"
  | "ambiguous_task_description"
  | "incorrect_agent_assignment"
  | "unverified_information_propagation"
  | "context_window_overflow"
  | "conflicting_instructions"
  | "premature_task_termination"
  | "agent_communication_failure"
  | "incorrect_termination_condition"
  | "infinite_loop_risk"
  | "missing_output_validation"
  | "hallucinated_tool_result"
  | "cost_overrun"
  | "timeout_exceeded"
  | "prompt_injection";

export type MastMeta = {
  label: string;
  explanation: string;
  recommendedFix: string;
};

export const MAST_LABELS: Record<MastMode, MastMeta> = {
  missing_error_handling: {
    label: "Missing error handling",
    explanation: "An agent hit a failing step without a fallback, retry, or recovery path.",
    recommendedFix: "Add explicit retries, fallback branches, and error-aware tool handling for this step.",
  },
  ambiguous_task_description: {
    label: "Ambiguous task",
    explanation: "The task given to the agent was too vague or underspecified to execute reliably.",
    recommendedFix: "Tighten the task prompt with concrete goals, constraints, and expected output structure.",
  },
  incorrect_agent_assignment: {
    label: "Wrong agent for the job",
    explanation: "A task appears to have been handed to an agent whose role or tools do not fit the work.",
    recommendedFix: "Reassign the step to a better-matched agent or adjust the agent's role and tool access.",
  },
  unverified_information_propagation: {
    label: "Unverified output passed on",
    explanation: "One agent passed information downstream without validating it before the next step relied on it.",
    recommendedFix: "Insert a validation or review step before downstream agents consume the output.",
  },
  context_window_overflow: {
    label: "Context window overflow",
    explanation: "The agent likely received more input than it could reliably keep in context.",
    recommendedFix: "Trim, summarize, chunk, or retrieve only the most relevant context before the decision point.",
  },
  conflicting_instructions: {
    label: "Conflicting instructions",
    explanation: "The agent appears to have received instructions that pull it in incompatible directions.",
    recommendedFix: "Resolve instruction priority and unify upstream prompts before the task reaches the agent.",
  },
  premature_task_termination: {
    label: "Task ended too early",
    explanation: "The agent marked work as complete before all expected outputs were actually produced.",
    recommendedFix: "Strengthen completion checks so the agent must satisfy all required outputs before finishing.",
  },
  agent_communication_failure: {
    label: "Dropped agent handoff",
    explanation: "A message or handoff was sent between agents, but no matching downstream receipt or execution was found.",
    recommendedFix: "Verify handoff wiring, message routing, and trace propagation between the sending and receiving agents.",
  },
  incorrect_termination_condition: {
    label: "Pipeline terminated incorrectly",
    explanation: "The overall workflow appears to have stopped before the full set of required agent work was complete.",
    recommendedFix: "Make termination conditions depend on verified completion across the full workflow, not a partial result.",
  },
  infinite_loop_risk: {
    label: "Infinite loop risk",
    explanation: "The system repeated similar work across the same agent enough times to suggest a loop or stuck state.",
    recommendedFix: "Add loop guards, iteration caps, and better state checks before repeating the same agent action.",
  },
  missing_output_validation: {
    label: "Missing final validation",
    explanation: "The final output appears to have been accepted without a validation or quality-check step.",
    recommendedFix: "Add an explicit verifier, reviewer, schema check, or acceptance test before treating output as complete.",
  },
  hallucinated_tool_result: {
    label: "Tool result looks invalid",
    explanation: "A tool output appears inconsistent with the expected schema or shape for that tool call.",
    recommendedFix: "Validate tool responses against a schema and fail fast when the response is malformed.",
  },
  cost_overrun: {
    label: "Cost threshold exceeded",
    explanation: "This run appears to have spent more than the project's configured budget threshold.",
    recommendedFix: "Reduce token usage, shorten loops, or adjust the project's allowed cost threshold for this workflow.",
  },
  timeout_exceeded: {
    label: "Timeout exceeded",
    explanation: "This agent or trace step ran longer than the project's configured time budget.",
    recommendedFix: "Shorten the step, add early exits, or raise the timeout threshold only if the longer runtime is expected.",
  },
  prompt_injection: {
    label: "Prompt injection",
    explanation: "External content in the agent's input attempted to override its instructions or escalate privileges.",
    recommendedFix: "Sanitize or fence untrusted content before including it in agent prompts, and validate that system instructions were not overridden.",
  },
};

export const getMastMeta = (mode: string): MastMeta => {
  return (
    MAST_LABELS[mode as MastMode] ?? {
      label: mode.replaceAll("_", " "),
      explanation: "This failure mode was detected but does not have curated UI copy yet.",
      recommendedFix: "Inspect the related span and add a more specific validation or recovery step.",
    }
  );
};
