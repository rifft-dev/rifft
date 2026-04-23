import { getMastMeta } from "@/lib/mast";
import type { TraceComparison, TraceDetail } from "./api-types";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

const formatSignedNumber = (value: number, unit = "") => `${value > 0 ? "+" : ""}${value}${unit}`;

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export const buildIncidentReport = (
  trace: TraceDetail,
  comparison: TraceComparison | null,
) => {
  const primaryFailure = trace.mast_failures[0] ?? null;
  const primaryFailureMeta = primaryFailure ? getMastMeta(primaryFailure.mode) : null;
  const rootCauseAgent = trace.causal_attribution.root_cause_agent_id ?? "Not inferred";
  const failingAgent = trace.causal_attribution.failing_agent_id ?? "Not inferred";
  const causalChain =
    trace.causal_attribution.causal_chain.length > 0
      ? trace.causal_attribution.causal_chain.join(" -> ")
      : "Not inferred";
  const failureLines =
    trace.mast_failures.length > 0
      ? trace.mast_failures
          .slice(0, 4)
          .map(
            (failure) =>
              `- ${failure.mode} (${failure.severity})${failure.agent_id ? ` on ${failure.agent_id}` : ""}: ${failure.explanation}`,
          )
          .join("\n")
      : "- No MAST failures were detected for this trace.";

  const comparisonSection = comparison
    ? [
        "## Before / After",
        `- Reference run: \`${comparison.baseline?.trace_id ?? "unknown"}\``,
        `- Verdict: ${comparison.verdict}`,
        `- Status: ${comparison.status_transition.baseline} -> ${comparison.status_transition.current}`,
        `- Failure delta: ${formatSignedNumber(comparison.deltas.failure_count)}`,
        `- Fatal failure delta: ${formatSignedNumber(comparison.deltas.fatal_failure_count)}`,
        `- Duration delta: ${formatSignedNumber(Math.round(comparison.deltas.duration_ms), "ms")}`,
        `- Cost delta: ${formatCurrency(comparison.deltas.cost_usd)}`,
        `- Root cause shift: ${comparison.root_cause.baseline ?? "Not inferred"} -> ${
          comparison.root_cause.current ?? "Not inferred"
        }`,
        comparison.failure_modes.new_modes.length > 0
          ? `- New failure modes: ${comparison.failure_modes.new_modes.join(", ")}`
          : "- New failure modes: none",
        comparison.failure_modes.resolved_modes.length > 0
          ? `- Resolved failure modes: ${comparison.failure_modes.resolved_modes.join(", ")}`
          : "- Resolved failure modes: none",
      ].join("\n")
    : [
        "## Before / After",
        "- No reference-run comparison is available yet for this incident.",
      ].join("\n");

  const recommendedFix = primaryFailureMeta?.recommendedFix ?? "Inspect the failing handoff and add a more specific guardrail or validation step.";

  return [
    `# Incident Report: ${trace.trace_id}`,
    "",
    "## Summary",
    `- Started: ${formatTimestamp(trace.started_at)}`,
    `- Status: ${trace.status}`,
    `- Agents involved: ${trace.agent_count}`,
    `- Spans captured: ${trace.span_count}`,
    `- Cost: ${formatCurrency(trace.total_cost_usd)}`,
    `- Root cause agent: ${rootCauseAgent}`,
    `- Failing agent: ${failingAgent}`,
    `- Primary failure: ${primaryFailureMeta?.label ?? primaryFailure?.mode ?? "No failure detected"}`,
    "",
    "## What happened",
    `- Causal chain: ${causalChain}`,
    trace.causal_attribution.explanation
      ? `- Attribution summary: ${trace.causal_attribution.explanation}`
      : "- Attribution summary: not inferred",
    "",
    "## Failure evidence",
    failureLines,
    "",
    comparisonSection,
    "",
    "## Recommended next fix",
    `- ${recommendedFix}`,
    primaryFailureMeta?.explanation ? `- Why this matters: ${primaryFailureMeta.explanation}` : null,
    "",
    "## Shareable takeaway",
    `Rifft identified ${rootCauseAgent} as the earliest contributing agent in trace \`${trace.trace_id}\`, with ${primaryFailureMeta?.label?.toLowerCase() ?? (primaryFailure?.mode ?? "a failure pattern")} as the clearest signal to fix next.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};
