import { init, trace, withSpan } from "../../../packages/sdk-js/src/index";

type SourceNote = {
  title: string;
  confidence: "high" | "medium" | "low";
};

type ResearchBrief = {
  summary: string;
  claims: string[];
  sources: SourceNote[];
  unsupportedClaim: string;
};

type VerifiedBrief = {
  summary: string;
  claims: string[];
  sources: SourceNote[];
  removedClaims: string[];
};

type RunMode = "broken" | "fixed";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createRunId = (mode: RunMode) =>
  `playground-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

const createConfig = () => ({
  endpoint: process.env.RIFFT_ENDPOINT ?? "http://localhost:4318",
  projectId: process.env.RIFFT_PROJECT_ID ?? "default",
  apiKey: process.env.RIFFT_API_KEY,
});

const isResearchBrief = (brief: ResearchBrief | VerifiedBrief): brief is ResearchBrief =>
  "unsupportedClaim" in brief;

const orchestrator = trace({
  agent_id: "orchestrator",
  framework: "custom",
  span_name: "agent.orchestrate",
})(async function orchestrateBrief(runId: string, mode: RunMode) {
  await sleep(120);

  return withSpan("workflow.plan", { agent_id: "orchestrator", framework: "custom" }, async (span) => {
    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("scenario.mode", mode);
    span.captureDecision({
      system_prompt:
        "Route work between specialist agents and produce a launch-ready incident brief with evidence-backed claims only.",
      conversation_history: [
        {
          role: "user",
          content: "Create a concise incident brief with only validated findings.",
        },
      ],
      available_tools: ["delegate_research", "delegate_validation", "delegate_writing"],
      chosen_action: "delegate_research",
      reasoning: "The workflow needs grounded findings before drafting can begin.",
    });

    return {
      task:
        "Prepare a launch-ready incident brief, but block unsupported claims before they reach the final draft.",
    };
  });
});

const researcher = trace({
  agent_id: "researcher",
  framework: "custom",
  span_name: "agent.research",
})(async function researchIncident(runId: string) {
  await sleep(180);

  return withSpan("tool.web_search", { agent_id: "researcher", framework: "custom" }, async (span) => {
    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("tool.name", "web_search");
    span.setAttribute("tool.input", {
      queries: ["incident handoff validation failure", "launch brief unsupported claim"],
    });
    span.captureDecision({
      system_prompt: "Find concise findings with confidence levels for downstream agents.",
      conversation_history: [
        {
          role: "user",
          content: "Gather findings and source quality notes for the brief.",
        },
      ],
      available_tools: ["web_search", "source_note_builder"],
      chosen_action: "web_search",
      reasoning: "The writer will need short findings and confidence metadata.",
    });

    return {
      summary:
        "The failure spread when a downstream writer treated an unverified claim as though it had already been confirmed.",
      claims: [
        "Unchecked handoffs amplified the initial mistake.",
        "A validation gate would have stopped the unsupported claim earlier.",
      ],
      unsupportedClaim: "Two independent sources confirmed the issue before publication.",
      sources: [
        { title: "Postmortem excerpt", confidence: "medium" },
        { title: "Ops chat summary", confidence: "low" },
      ],
    } satisfies ResearchBrief;
  });
});

const verifier = trace({
  agent_id: "verifier",
  framework: "custom",
  span_name: "agent.verify",
})(async function verifyResearchBrief(runId: string, brief: ResearchBrief) {
  await sleep(140);

  return withSpan("output.verify_sources", { agent_id: "verifier", framework: "custom" }, async (span) => {
    const removedClaims =
      brief.sources.some((source) => source.confidence === "low") ? [brief.unsupportedClaim] : [];

    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("verification.removed_claims", removedClaims);
    span.setAttribute("verification.source_confidence", brief.sources);
    span.captureDecision({
      system_prompt:
        "Remove or downgrade any claim that is not supported by the source-confidence metadata.",
      conversation_history: [
        {
          role: "assistant",
          content: "Received a research brief with mixed-confidence sources.",
        },
      ],
      available_tools: ["strip_unsupported_claims", "approve_claims"],
      chosen_action: removedClaims.length > 0 ? "strip_unsupported_claims" : "approve_claims",
      reasoning:
        "The final brief should not inherit confident wording when the supporting sources are mixed or weak.",
    });

    return {
      summary: brief.summary,
      claims: brief.claims,
      sources: brief.sources,
      removedClaims,
    } satisfies VerifiedBrief;
  });
});

const writer = trace({
  agent_id: "writer",
  framework: "custom",
  span_name: "agent.write",
})(async function writeBrief(runId: string, brief: ResearchBrief | VerifiedBrief, mode: RunMode) {
  await sleep(160);

  return withSpan("draft.brief", { agent_id: "writer", framework: "custom" }, async (span) => {
    const removedClaims = "removedClaims" in brief ? brief.removedClaims : [];
    const finalClaims = [...brief.claims];

    if (mode === "broken" && isResearchBrief(brief)) {
      finalClaims.push(brief.unsupportedClaim);
    }

    const summary =
      mode === "broken"
        ? "The final brief states the issue was independently verified, even though no validation step confirmed that."
        : "The final brief removes the unsupported certainty and keeps only evidence-backed findings.";

    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("draft.claims", finalClaims);
    span.setAttribute("draft.removed_claims", removedClaims);
    span.captureDecision({
      system_prompt: "Turn the available notes into a concise launch-ready incident brief.",
      conversation_history: [
        {
          role: "assistant",
          content:
            mode === "broken"
              ? "Received a research handoff and assumed the strong claim was already verified."
              : "Received a verified brief with unsupported claims removed.",
        },
      ],
      available_tools: ["finalize_copy"],
      chosen_action: "finalize_copy",
      reasoning:
        mode === "broken"
          ? "The handoff sounded complete enough to publish immediately."
          : "The verifier narrowed the brief to claims that are safe to publish.",
    });

    return {
      headline: "Unchecked agent handoffs caused the incident to spread.",
      summary,
      claims: finalClaims,
    };
  });
});

const outputValidator = trace({
  agent_id: "writer",
  framework: "custom",
  span_name: "agent.validate_output",
})(async function validateOutput(
  runId: string,
  draft: { headline: string; summary: string; claims: string[] },
) {
  await sleep(80);

  return withSpan("output.validate", { agent_id: "writer", framework: "custom" }, async (span) => {
    const unsupportedClaim = draft.claims.find((claim) => claim.includes("Two independent sources confirmed"));
    const passed = !unsupportedClaim;

    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("validation.passed", passed);
    span.setAttribute("validation.claim_count", draft.claims.length);

    if (!passed) {
      span.setAttribute("error.message", "Draft includes an unsupported claim.");
      span.addEvent("draft.rejected", {
        reason: "unsupported_claim",
        severity: "fatal",
      });
      throw new Error("Draft includes an unsupported claim that should have been filtered earlier.");
    }

    span.addEvent("draft.approved", { severity: "info" });
    return { passed: true };
  });
});

const recordAgentHandoff = async (
  runId: string,
  fromAgent: string,
  toAgent: string,
  payload: Record<string, unknown>,
) => {
  await withSpan("rifft.agent_to_agent", { agent_id: fromAgent, framework: "custom" }, async (span) => {
    span.setAttribute("trace.playground_run_id", runId);
    span.setAttribute("source_agent_id", fromAgent);
    span.setAttribute("target_agent_id", toAgent);
    span.setAttribute("protocol", "agent_to_agent");
    span.setAttribute("message", payload);
  });
};

export const runScenario = async (mode: RunMode) => {
  const config = createConfig();
  const runId = createRunId(mode);

  init({
    project_id: config.projectId,
    endpoint: config.endpoint,
    api_key: config.apiKey,
  });

  try {
    const outcome = await withSpan(
      "playground.debug_handoff",
      { agent_id: "orchestrator", framework: "custom" },
      async (rootSpan) => {
        rootSpan.setAttribute("trace.playground_run_id", runId);
        rootSpan.setAttribute("scenario.name", "debug-handoff");
        rootSpan.setAttribute("scenario.mode", mode);

        await orchestrator(runId, mode);

        await recordAgentHandoff(runId, "orchestrator", "researcher", {
          type: "research_assignment",
          task:
            "Prepare findings for a launch-ready incident brief and include source-confidence metadata.",
          required_outputs: ["summary", "claims", "sources", "unsupported_claims"],
          next_step:
            mode === "broken"
              ? "Send research directly to writer."
              : "Send research to verifier before writer.",
        });

        const researchBrief = await researcher(runId);

        await recordAgentHandoff(runId, "researcher", mode === "broken" ? "writer" : "verifier", {
          type: "research_brief",
          summary: researchBrief.summary,
          claims: researchBrief.claims,
          unsupported_claim: researchBrief.unsupportedClaim,
          sources: researchBrief.sources,
        });

        if (mode === "fixed") {
          const preparedBrief = await verifier(runId, researchBrief);
          await recordAgentHandoff(runId, "verifier", "writer", {
            type: "verified_brief",
            summary: preparedBrief.summary,
            claims: preparedBrief.claims,
            removed_claims: preparedBrief.removedClaims,
            sources: preparedBrief.sources,
          });

          const draft = await writer(runId, preparedBrief, mode);
          await outputValidator(runId, draft);

          return {
            runId,
            status: "passed",
            headline: draft.headline,
          };
        }

        const draft = await writer(runId, researchBrief, mode);
        await outputValidator(runId, draft);

        return {
          runId,
          status: "passed",
          headline: draft.headline,
        };
      },
    );

    return outcome;
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage =
        error.message === "fetch failed"
          ? `Trace export failed. Make sure the local collector is running at ${config.endpoint}.`
          : error.message;

      return {
        runId,
        status: "failed",
        error: errorMessage,
      };
    }

    return {
      runId,
      status: "failed",
      error: String(error),
    };
  }
};
