import Fastify from "fastify";
import Stripe from "stripe";
import type { FastifyRequest } from "fastify";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { closePools, pgPool } from "./db.js";
import { buildRemoveMemberInput } from "./membership.js";
import { getBearerToken, getSupabaseAdminClient, isSupabaseConfigured } from "./supabase.js";
import {
  bootstrapCloudProject,
  createCloudWorkspaceForUser,
  createProject,
  getAccessibleProject,
  getProject,
  getDefaultProjectForUser,
  getAgentDetail,
  regenerateProjectApiKey,
  getCloudProjectUsageSummary,
  getProjectBaseline,
  getProjectInsights,
  syncStripeSubscription,
  getTraceProjectId,
  listForkDrafts,
  listProjectsForUser,
  getTrace,
  getTraceComparison,
  getTraceGraph,
  getTraceTimeline,
  listTraces,
  setProjectBaseline,
  upsertForkDraft,
  updateProjectSettings,
  deleteProject,
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
  getAlertCandidatesForTrace,
  getProjectAlertSettings,
  updateProjectAlertSettings,
  getProjectAlertDeliveryTargets,
  recordProjectAlertDelivery,
  getStoredTraceFailureExplanation,
  upsertTraceFailureExplanation,
  getProjectPlanKey,
  consumePendingInvites,
  isPrimaryWorkspace,
  createIncidentShare,
  getIncidentShareByToken,
  detectRegressions,
  getWeeklyDigestStats,
  getScaleProjectsWithDigestEnabled,
  getOptimizationSuggestions,
  getTraceAttributeCorrelations,
  getAgentFailureDiff,
} from "./queries.js";

const port = Number(process.env.PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL ?? "";
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "";
const clickhouseUser = process.env.CLICKHOUSE_USER ?? "default";
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? "";

type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

const getAuthenticatedUser = async (authorizationHeader?: string): Promise<AuthenticatedUser | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name:
      (data.user.user_metadata.full_name as string | undefined) ??
      (data.user.user_metadata.name as string | undefined) ??
      null,
  };
};

const canAccessTrace = async (user: AuthenticatedUser | null, traceId: string) => {
  const projectId = await getTraceProjectId(traceId);
  if (!projectId) {
    return false;
  }

  const project = await getProject(projectId);
  if (!project) {
    return false;
  }

  if (!user) {
    return !project.account_id;
  }

  const accessibleProject = await getAccessibleProject(user.id, projectId);
  return Boolean(accessibleProject);
};

const getStripeCustomerIdForAccount = async (accountId: string): Promise<string | null> => {
  const sub = await pgPool.query<{ provider_customer_id: string }>(
    `SELECT provider_customer_id FROM subscriptions
     WHERE account_id = $1 AND provider = 'stripe'
     AND status IN ('active', 'trialing', 'past_due')
     ORDER BY updated_at DESC LIMIT 1`,
    [accountId],
  );

  return sub.rows[0]?.provider_customer_id ?? null;
};

const createStripeBillingPortalSession = async ({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("stripe_not_configured");
  }

  const stripe = new Stripe(stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
};

const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rifft.dev";

const formatUsd = (value: number) => `$${value.toFixed(4)}`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const maskSlackTarget = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.host} ••••${value.slice(-4)}`;
  } catch {
    return `Slack webhook ••••${value.slice(-4)}`;
  }
};

const formatFatalFailureSummary = (
  fatalFailures: Array<{ mode: string; agent_id: string | null; explanation: string }>,
) =>
  fatalFailures
    .slice(0, 3)
    .map((failure) => {
      const agentLabel = failure.agent_id ? ` (${failure.agent_id})` : "";
      return `${failure.mode}${agentLabel}: ${failure.explanation}`;
    })
    .join("\n");

const sendSlackAlert = async ({
  webhookUrl,
  title,
  bodyLines,
  actionUrl,
}: {
  webhookUrl: string;
  title: string;
  bodyLines: string[];
  actionUrl: string;
}) => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `${title}\n${bodyLines.join("\n")}\n${actionUrl}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: title,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: bodyLines.map((line) => `• ${line}`).join("\n"),
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open trace",
              },
              url: actionUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`slack_webhook_rejected:${response.status}`);
  }
};

const sendAlertEmail = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("email_provider_not_configured");
  }

  const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@rifft.dev";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`email_send_failed:${response.status}:${errorBody}`);
  }
};

const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;

const compactJson = (value: unknown, maxLength = 1200) =>
  truncateText(
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "null"),
    maxLength,
  );

const extractJsonObject = (value: string) => {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return value.slice(firstBrace, lastBrace + 1);
  }

  return value.trim();
};

// Extracts quantitative LLM attributes from all spans belonging to one agent.
// These numbers — token counts, model names, context limits, error messages — are
// the primary evidence Claude needs to cite in a meaningful failure explanation.
const extractAgentLlmStats = (spans: Array<{
  attributes: unknown;
  status: string;
  events?: unknown;
  duration_ms: number;
}>) => {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let maxInputTokensSingleCall = 0;
  let contextLimit: number | null = null;
  const modelsUsed = new Set<string>();
  const errorMessages: string[] = [];

  for (const span of spans) {
    const attrs = span.attributes as Record<string, unknown>;

    const inputTokens =
      Number(attrs["llm.input_tokens"] ?? attrs["prompt_tokens"] ?? attrs["input_tokens"] ?? 0) || 0;
    const outputTokens =
      Number(attrs["llm.output_tokens"] ?? attrs["completion_tokens"] ?? attrs["output_tokens"] ?? 0) || 0;
    const model = String(attrs["llm.model"] ?? attrs["model"] ?? "").trim();
    const limit =
      Number(attrs["context_limit"] ?? attrs["llm.context_limit"] ?? attrs["model_context_limit"] ?? 0) || 0;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    if (inputTokens > maxInputTokensSingleCall) maxInputTokensSingleCall = inputTokens;
    if (model) modelsUsed.add(model);
    if (limit > 0 && (contextLimit === null || limit < contextLimit)) contextLimit = limit;

    // Pull error messages from OpenTelemetry exception events
    const events = (Array.isArray(span.events) ? span.events : []) as Array<{
      name?: string;
      attributes?: Record<string, unknown>;
    }>;
    for (const event of events) {
      if (event.name === "exception" || event.name === "error") {
        const msg = String(
          event.attributes?.["exception.message"] ??
            event.attributes?.["message"] ??
            "",
        ).trim();
        if (msg && !errorMessages.includes(msg)) {
          errorMessages.push(msg);
        }
      }
    }

    // Also check span-level error attributes
    if (span.status === "error") {
      const errMsg = String(attrs["error.message"] ?? attrs["error"] ?? "").trim();
      if (errMsg && !errorMessages.includes(errMsg)) {
        errorMessages.push(errMsg);
      }
    }
  }

  return {
    total_input_tokens: totalInputTokens > 0 ? totalInputTokens : null,
    total_output_tokens: totalOutputTokens > 0 ? totalOutputTokens : null,
    max_input_tokens_single_call: maxInputTokensSingleCall > 0 ? maxInputTokensSingleCall : null,
    context_limit: contextLimit,
    models_used: [...modelsUsed],
    // Truncate long error messages so they fit cleanly in the prompt
    error_messages: errorMessages.slice(0, 3).map((m) => truncateText(m, 200)),
  };
};

const buildFailureExplanationPromptContext = async (traceId: string) => {
  const trace = await getTrace(traceId);
  if (!trace) {
    return null;
  }

  const fatalFailures = trace.mast_failures.filter(
    (failure: { severity: string; mode: string; agent_id: string | null; explanation: string }) =>
      failure.severity === "fatal",
  );
  if (fatalFailures.length === 0) {
    return {
      trace,
      context: null,
    };
  }

  const relevantAgentIds = [...new Set([
    trace.causal_attribution.root_cause_agent_id,
    trace.causal_attribution.failing_agent_id,
    ...fatalFailures.map((failure: { agent_id: string | null }) => failure.agent_id),
  ].filter((value): value is string => Boolean(value)))].slice(0, 3);

  const agentDetails = await Promise.all(
    relevantAgentIds.map(async (agentId) => ({
      agent_id: agentId,
      detail: await getAgentDetail(traceId, agentId),
    })),
  );
  const hydratedAgentDetails = agentDetails.filter(
    (
      entry,
    ): entry is {
      agent_id: string;
      detail: NonNullable<Awaited<ReturnType<typeof getAgentDetail>>>;
    } => entry.detail !== null,
  );

  // Build per-agent LLM stats from raw spans for the relevant agents
  const agentLlmStats: Record<string, ReturnType<typeof extractAgentLlmStats>> = {};
  for (const agentId of relevantAgentIds) {
    const agentSpans = trace.spans.filter(
      (span: { agent_id: string | null }) => span.agent_id === agentId,
    );
    agentLlmStats[agentId] = extractAgentLlmStats(agentSpans);
  }

  const highlightedMessages = trace.communication_spans
    .filter(
      (span) =>
        relevantAgentIds.includes(span.source_agent_id) ||
        relevantAgentIds.includes(span.target_agent_id),
    )
    .slice(-8)
    .map((span) => ({
      span_id: span.span_id,
      from: span.source_agent_id,
      to: span.target_agent_id,
      status: span.status,
      timestamp: span.start_time,
      payload_preview: compactJson(span.message, 800),
    }));

  return {
    trace,
    context: {
      trace: {
        trace_id: trace.trace_id,
        root_span_name: trace.root_span_name,
        started_at: trace.started_at,
        duration_ms: trace.duration_ms,
        total_cost_usd: trace.total_cost_usd,
        status: trace.status,
        fatal_failures: fatalFailures.map((failure: { mode: string; agent_id: string | null; explanation: string }) => ({
          mode: failure.mode,
          agent_id: failure.agent_id,
          explanation: failure.explanation,
        })),
        causal_attribution: trace.causal_attribution,
      },
      agents: hydratedAgentDetails.map(({ agent_id, detail }) => ({
        agent_id,
        summary: detail.summary,
        // Quantitative LLM attributes — cite these with exact values in the explanation
        llm_stats: agentLlmStats[agent_id] ?? null,
        mast_failures: detail.mast_failures,
        decision_context: detail.decision_context
          ? compactJson(detail.decision_context, 1000)
          : null,
        messages: detail.messages.slice(-4).map((message) => ({
          span_id: message.span_id,
          from: message.sender,
          to: message.receiver,
          payload_preview: compactJson(message.payload, 700),
        })),
        tool_calls: detail.tool_calls.slice(-3).map((toolCall) => ({
          span_id: toolCall.span_id,
          tool_name: toolCall.tool_name,
          input_preview: compactJson(toolCall.input, 500),
          output_preview: compactJson(toolCall.output, 500),
        })),
      })),
      highlighted_messages: highlightedMessages,
    },
  };
};

const generateFailureExplanationWithAnthropic = async (
  traceId: string,
): Promise<
  | {
      trace: NonNullable<Awaited<ReturnType<typeof getTrace>>>;
      explanation: {
        summary: string;
        evidence: string[];
        recommended_fix: string;
        confidence: "high" | "medium" | "low";
        key_stats: Array<{ label: string; value: string; flag: "ok" | "warning" | "critical" }>;
        model: string;
      };
    }
  | null
> => {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("anthropic_not_configured");
  }

  const promptContext = await buildFailureExplanationPromptContext(traceId);
  if (!promptContext) {
    return null;
  }

  if (!promptContext.context) {
    throw new Error("no_fatal_failure");
  }

  const systemPrompt = `You are Rifft, an AI observability assistant that diagnoses multi-agent pipeline failures.

Your task: explain WHY a failure happened, tracing the causal chain — not just WHAT label was applied.

Rules:
- Produce ONLY strict JSON. No prose, no markdown, no code fences.
- Do NOT invent facts not present in the trace context.
- When token counts, costs, durations, model names, or error messages are present in the context, you MUST cite them with their exact values — not paraphrased.
- Trace the causal chain: if one agent produced output that caused a downstream agent to fail, name both agents and the connection explicitly.
- If an agent's max_input_tokens_single_call approaches or exceeds its context_limit, flag this as a likely cause.
- If error_messages are present, quote them verbatim (truncated to ~80 chars if long).
- If a payload preview is marked as truncated, note that rather than assuming what it contained.`;

  const userPrompt = `Analyze this trace context and explain the fatal failure for a developer who needs to fix their agent pipeline right now.

Return strict JSON with exactly this shape:
{
  "summary": string,
  "evidence": string[],
  "recommended_fix": string,
  "confidence": "high" | "medium" | "low",
  "key_stats": [{ "label": string, "value": string, "flag": "ok" | "warning" | "critical" }]
}

Field rules:
- summary: one paragraph ≤130 words. Name the failing agent, the MAST failure mode, the upstream cause if one exists, and the concrete impact. Cite at least one specific number from the trace (tokens, cost, duration, etc.).
- evidence: 2–4 items. EACH item must reference a specific agent ID, span attribute value, token count, cost figure, model name, error message, or payload excerpt from the context. No generic statements like "the agent failed" — cite the data.
- recommended_fix: one concrete engineering change ≤70 words. Tailor it to the evidence: if tokens overflow, name a specific limit; if bad output propagated, suggest a validation layer at the specific handoff; if a tool call failed, suggest retry logic or a fallback.
- confidence: "low" if key attributes are null, payloads are heavily truncated, or the causal chain is ambiguous.
- key_stats: exactly 2–3 objects. Pick the most diagnostically important quantitative facts from this trace. Use "ok" for values in normal range, "warning" for elevated but not catastrophic, "critical" for values that directly contributed to the failure. Examples: input token count vs context limit, total cost, agent duration, error count.

Trace context:
${JSON.stringify(promptContext.context, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 1100,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`anthropic_request_failed:${response.status}:${errorBody}`);
  }

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("anthropic_empty_response");
  }

  const parsed = JSON.parse(extractJsonObject(text)) as {
    summary?: string;
    evidence?: string[];
    recommended_fix?: string;
    confidence?: string;
    key_stats?: Array<{ label?: string; value?: string; flag?: string }>;
  };

  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.evidence) ||
    typeof parsed.recommended_fix !== "string"
  ) {
    throw new Error("anthropic_invalid_response");
  }

  const validFlags = new Set(["ok", "warning", "critical"]);
  const keyStats = (Array.isArray(parsed.key_stats) ? parsed.key_stats : [])
    .filter(
      (item): item is { label: string; value: string; flag: string } =>
        typeof item?.label === "string" &&
        typeof item?.value === "string" &&
        typeof item?.flag === "string",
    )
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
      flag: (validFlags.has(item.flag) ? item.flag : "ok") as "ok" | "warning" | "critical",
    }))
    .slice(0, 3);

  return {
    trace: promptContext.trace,
    explanation: {
      summary: parsed.summary.trim(),
      evidence: parsed.evidence.map((item) => String(item).trim()).filter(Boolean).slice(0, 4),
      recommended_fix: parsed.recommended_fix.trim(),
      confidence:
        parsed.confidence === "high"
          ? "high"
          : parsed.confidence === "low"
            ? "low"
            : "medium",
      key_stats: keyStats,
      model: anthropicModel,
    },
  };
};

type AppDeps = {
  getAuthenticatedUser: typeof getAuthenticatedUser;
  getAccessibleProject: typeof getAccessibleProject;
  getProject: typeof getProject;
  getTrace: typeof getTrace;
  bootstrapCloudProject: typeof bootstrapCloudProject;
  consumePendingInvites: typeof consumePendingInvites;
  createCloudWorkspaceForUser: typeof createCloudWorkspaceForUser;
  deleteProject: typeof deleteProject;
  isPrimaryWorkspace: typeof isPrimaryWorkspace;
  getStripeCustomerIdForAccount: typeof getStripeCustomerIdForAccount;
  createStripeBillingPortalSession: typeof createStripeBillingPortalSession;
  listProjectMembers: typeof listProjectMembers;
  addProjectMember: typeof addProjectMember;
  removeProjectMember: typeof removeProjectMember;
  getProjectAlertSettings: typeof getProjectAlertSettings;
  updateProjectAlertSettings: typeof updateProjectAlertSettings;
  getProjectAlertDeliveryTargets: typeof getProjectAlertDeliveryTargets;
  recordProjectAlertDelivery: typeof recordProjectAlertDelivery;
  getAlertCandidatesForTrace: typeof getAlertCandidatesForTrace;
  getStoredTraceFailureExplanation: typeof getStoredTraceFailureExplanation;
  upsertTraceFailureExplanation: typeof upsertTraceFailureExplanation;
  getProjectPlanKey: typeof getProjectPlanKey;
  generateFailureExplanation: typeof generateFailureExplanationWithAnthropic;
  createIncidentShare: typeof createIncidentShare;
  getIncidentShareByToken: typeof getIncidentShareByToken;
  getTraceProjectId: typeof getTraceProjectId;
  detectRegressions: typeof detectRegressions;
  getWeeklyDigestStats: typeof getWeeklyDigestStats;
  getScaleProjectsWithDigestEnabled: typeof getScaleProjectsWithDigestEnabled;
  getOptimizationSuggestions: typeof getOptimizationSuggestions;
  getTraceAttributeCorrelations: typeof getTraceAttributeCorrelations;
  getAgentFailureDiff: typeof getAgentFailureDiff;
  pgQuery: (query: string, params?: unknown[]) => Promise<unknown>;
};

export const createApp = (
  deps: Partial<AppDeps> = {},
) => {
  const app = Fastify({ logger: false });
  const resolvedDeps: AppDeps = {
    getAuthenticatedUser,
    getAccessibleProject,
    getProject,
    getTrace,
    bootstrapCloudProject,
    consumePendingInvites,
    createCloudWorkspaceForUser,
    deleteProject,
    isPrimaryWorkspace,
    getStripeCustomerIdForAccount,
    createStripeBillingPortalSession,
    listProjectMembers,
    addProjectMember,
    removeProjectMember,
    getProjectAlertSettings,
    updateProjectAlertSettings,
    getProjectAlertDeliveryTargets,
    recordProjectAlertDelivery,
    getAlertCandidatesForTrace,
    getStoredTraceFailureExplanation,
    upsertTraceFailureExplanation,
    getProjectPlanKey,
    generateFailureExplanation: generateFailureExplanationWithAnthropic,
    createIncidentShare,
    getIncidentShareByToken,
    getTraceProjectId,
    detectRegressions,
    getWeeklyDigestStats,
    getScaleProjectsWithDigestEnabled,
    getOptimizationSuggestions,
    getTraceAttributeCorrelations,
    getAgentFailureDiff,
    pgQuery: pgPool.query.bind(pgPool),
    ...deps,
  };

  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    try {
      const rawBody = typeof body === "string" ? body : body.toString("utf8");
      (request as FastifyRequest & { rawBody?: string }).rawBody = rawBody;
      done(null, JSON.parse(rawBody));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.get("/health", async (_req, reply) => {
    const checks = {
      postgresConfigured: databaseUrl.length > 0,
      clickhouseConfigured: clickhouseUrl.length > 0,
      supabaseConfigured: supabaseUrl.length > 0,
      clickhouseReachable: false as boolean,
      postgresReachable: false as boolean,
    };

    // Probe ClickHouse with a trivial query (timeout 3 s)
    if (clickhouseUrl) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(clickhouseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "X-ClickHouse-User": clickhouseUser,
            "X-ClickHouse-Key": clickhousePassword,
          },
          body: "SELECT 1",
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        checks.clickhouseReachable = res.ok;
      } catch {
        checks.clickhouseReachable = false;
      }
    }

    // Probe Postgres with a trivial query (timeout 3 s)
    if (databaseUrl) {
      try {
        await Promise.race([
          pgPool.query("SELECT 1"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
        checks.postgresReachable = true;
      } catch {
        checks.postgresReachable = false;
      }
    }

    const degraded = checks.clickhouseConfigured && !checks.clickhouseReachable;
    const status = degraded ? "degraded" : "ok";
    reply.code(degraded ? 200 : 200); // always 200 so uptime monitors don't fire on degraded
    return { status, service: "api", dependencies: checks };
  });

  app.post("/webhooks/stripe", async (request, reply) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    reply.code(500);
    return { error: "stripe_not_configured" };
  }

  const sig = request.headers["stripe-signature"];
  if (typeof sig !== "string") {
    reply.code(400);
    return { error: "missing_signature" };
  }

  const stripe = new Stripe(stripeSecretKey);
  let event: Stripe.Event;

  try {
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    reply.code(400);
    return { error: "invalid_signature" };
  }

  const relevantEvents = new Set([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ]);

  if (!relevantEvents.has(event.type)) {
    return { received: true, ignored: true };
  }

  const subscription = event.data.object as Stripe.Subscription & {
    customer: string;
    current_period_start: number;
    current_period_end: number;
  };
  const result = await syncStripeSubscription(event.type, subscription);
  return { received: true, ...result };
  });

  app.get("/projects", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  return {
    projects: await listProjectsForUser(user.id),
  };
  });

  app.get("/cloud/me", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const activeProject = await getDefaultProjectForUser(user.id);
  return {
    user,
    active_project: activeProject,
  };
  });

  app.get("/cloud/projects", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  return {
    projects: await listProjectsForUser(user.id),
  };
  });

  app.post("/cloud/projects", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const bodySchema = z.object({
    name: z.string().trim().min(1).max(100),
    current_project_id: z.string().trim().min(1).optional(),
  });
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  try {
    const project = await resolvedDeps.createCloudWorkspaceForUser({
      userId: user.id,
      email: user.email,
      name: parsed.data.name,
      currentProjectId: parsed.data.current_project_id ?? null,
    });
    reply.code(201);
    return { project };
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      reply.code(403);
      return { error: "forbidden" };
    }
    if (error instanceof Error && error.message === "missing_account") {
      reply.code(400);
      return { error: "missing_account" };
    }
    if (error instanceof Error && error.message === "invalid_name") {
      reply.code(400);
      return { error: "invalid_name" };
    }
    throw error;
  }
  });

  app.post("/stripe/customer-portal", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const body = request.body as { account_id?: string; return_url?: string };
  if (!body.account_id) {
    reply.code(400);
    return { error: "missing_account_id" };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    reply.code(500);
    return { error: "stripe_not_configured" };
  }

  const customerId = await resolvedDeps.getStripeCustomerIdForAccount(body.account_id);
  if (!customerId) {
    reply.code(404);
    return { error: "no_stripe_customer" };
  }

  const url = await resolvedDeps.createStripeBillingPortalSession({
    customerId,
    returnUrl: body.return_url ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rifft.dev"}/settings`,
  });

  return { url };
  });

  app.get("/projects/:id", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  const project = user
    ? await resolvedDeps.getAccessibleProject(user.id, projectId)
    : await resolvedDeps.getProject(projectId);
  if (!user && project?.account_id) {
    reply.code(404);
    return { error: "not_found" };
  }
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return {
    ...project,
    is_primary_workspace: await isPrimaryWorkspace(projectId),
  };
  });

  // Scale-only: cost and latency optimisation suggestions
  app.get("/projects/:id/optimization-suggestions", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    const planKey = await resolvedDeps.getProjectPlanKey(projectId);
    if (planKey !== "scale") {
      reply.code(403);
      return { error: "scale_plan_required" };
    }

    const result = await resolvedDeps.getOptimizationSuggestions(projectId);
    return result;
  });

  // Agent failure diff — Pro+ gated. Per-agent fatal vs successful distributions.
  app.get("/projects/:id/agent-failure-diff", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    const planKey = await resolvedDeps.getProjectPlanKey(projectId);
    if (planKey === "free") {
      reply.code(403);
      return { error: "pro_plan_required" };
    }

    const agents = await resolvedDeps.getAgentFailureDiff(projectId);
    return { agents };
  });

  // Attribute correlation analysis — Pro+ gated (needs enough trace history)
  app.get("/projects/:id/attribute-correlations", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    const planKey = await resolvedDeps.getProjectPlanKey(projectId);
    if (planKey === "free") {
      reply.code(403);
      return { error: "pro_plan_required" };
    }

    const findings = await resolvedDeps.getTraceAttributeCorrelations(projectId);
    return { findings };
  });

  app.get("/projects/:id/alerts", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    const alerts = await resolvedDeps.getProjectAlertSettings(projectId);
    if (!alerts) {
      reply.code(404);
      return { error: "not_found" };
    }

    return alerts;
  });

  app.patch("/projects/:id/alerts", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const bodySchema = z.object({
      fatal_failures_enabled: z.boolean().optional(),
      regression_digest_enabled: z.boolean().optional(),
      slack_webhook_url: z.string().url().nullable().optional(),
      alert_email: z.string().email().nullable().optional(),
    });
    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return {
        error: "invalid_request",
        message: parsed.error.message,
      };
    }

    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const currentAlerts = await resolvedDeps.getProjectAlertSettings(projectId);
    if (!currentAlerts) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!currentAlerts.available) {
      reply.code(403);
      return { error: "alerting_requires_paid_plan" };
    }
    if (parsed.data.regression_digest_enabled && !currentAlerts.regression_available) {
      reply.code(403);
      return { error: "regression_digest_requires_scale_plan" };
    }

    try {
      const alerts = await resolvedDeps.updateProjectAlertSettings(projectId, parsed.data);
      if (!alerts) {
        reply.code(404);
        return { error: "not_found" };
      }

      return alerts;
    } catch (error) {
      if (error instanceof Error && error.message === "alert_destination_required") {
        reply.code(422);
        return { error: "alert_destination_required" };
      }
      throw error;
    }
  });

  app.post("/projects/:id/alerts/test", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const bodySchema = z.object({
      channel: z.enum(["slack", "email"]),
      slack_webhook_url: z.string().url().nullable().optional(),
      alert_email: z.string().email().nullable().optional(),
    });
    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return {
        error: "invalid_request",
        message: parsed.error.message,
      };
    }

    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const currentAlerts = await resolvedDeps.getProjectAlertSettings(projectId);
    if (!currentAlerts) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!currentAlerts.available) {
      reply.code(403);
      return { error: "alerting_requires_paid_plan" };
    }

    const target =
      parsed.data.channel === "slack"
        ? parsed.data.slack_webhook_url ?? (await resolvedDeps.getProjectAlertDeliveryTargets(projectId))?.slack_webhook_url ?? null
        : parsed.data.alert_email ?? (await resolvedDeps.getProjectAlertDeliveryTargets(projectId))?.alert_email ?? null;

    if (!target) {
      reply.code(422);
      return { error: "alert_destination_required" };
    }

    const project = await resolvedDeps.getProject(projectId);
    if (!project) {
      reply.code(404);
      return { error: "not_found" };
    }

    try {
      if (parsed.data.channel === "slack") {
        await sendSlackAlert({
          webhookUrl: target,
          title: `Test alert from Rifft`,
          bodyLines: [
            `Workspace: ${project.name}`,
            "This is a test fatal failure notification.",
            "Real alerts will include the root cause summary and a direct trace link.",
          ],
          actionUrl: `${appBaseUrl}/settings`,
        });
      } else {
        await sendAlertEmail({
          to: target,
          subject: `Rifft test alert: ${project.name}`,
          html: `<p>This is a test alert from <strong>${project.name}</strong>.</p><p>Real fatal failure alerts include the root cause summary and a direct trace link.</p><p><a href="${appBaseUrl}/settings">Open Rifft settings</a></p>`,
          text: `This is a test alert from ${project.name}.\n\nReal fatal failure alerts include the root cause summary and a direct trace link.\n\nOpen Rifft settings: ${appBaseUrl}/settings`,
        });
      }

      await resolvedDeps.recordProjectAlertDelivery({
        projectId,
        channel: parsed.data.channel,
        eventType: "test",
        status: "sent",
        targetLabel: parsed.data.channel === "slack" ? maskSlackTarget(target) : target,
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "alert_test_failed";
      await resolvedDeps.recordProjectAlertDelivery({
        projectId,
        channel: parsed.data.channel,
        eventType: "test",
        status: "failed",
        targetLabel: parsed.data.channel === "slack" ? maskSlackTarget(target) : target,
        error: message,
      });
      reply.code(message === "email_provider_not_configured" ? 500 : 502);
      return {
        error: message === "email_provider_not_configured" ? "email_provider_not_configured" : "alert_test_failed",
      };
    }
  });

  // ─── Incident sharing ───────────────────────────────────────────────────────

  app.post("/projects/:id/traces/:traceId/share", async (request, reply) => {
    const { id: projectId, traceId } = request.params as { id: string; traceId: string };

    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    const planKey = await resolvedDeps.getProjectPlanKey(projectId);
    if (planKey === "free") {
      reply.code(403);
      return { error: "incident_sharing_requires_paid_plan" };
    }

    const traceProjectId = await resolvedDeps.getTraceProjectId(traceId);
    if (traceProjectId !== projectId) {
      reply.code(404);
      return { error: "not_found" };
    }

    const token = await resolvedDeps.createIncidentShare(traceId, projectId, user.id);
    return { token, url: `${appBaseUrl}/incident/${token}` };
  });

  app.get("/incident/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    const share = await resolvedDeps.getIncidentShareByToken(token);
    if (!share) {
      reply.code(404);
      return { error: "not_found" };
    }

    const [traceResult, comparisonResult] = await Promise.allSettled([
      getTrace(share.trace_id),
      getTraceComparison(share.trace_id),
    ]);

    const traceData = traceResult.status === "fulfilled" ? traceResult.value : null;
    if (!traceData) {
      reply.code(404);
      return { error: "not_found" };
    }

    const comparison =
      comparisonResult.status === "fulfilled" ? comparisonResult.value : null;

    return {
      trace: traceData,
      comparison: comparison ?? null,
      shared_at: share.created_at,
    };
  });

app.post("/projects", async (request, reply) => {
  const bodySchema = z.object({
    name: z.string().min(1).max(100),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const project = await createProject(parsed.data.name);
  reply.code(201);
  return project;
});

  app.post("/cloud/bootstrap", async (request, reply) => {
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  const project = await resolvedDeps.bootstrapCloudProject({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  const invitedProjectId = user.email
    ? await resolvedDeps.consumePendingInvites(user.id, user.email)
    : null;

  const activeProjectId = project.id;

  return {
    project,
    active_project_id: activeProjectId,
    invited_project_id: invitedProjectId,
  };
  });

app.patch("/projects/:id", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.object({
    retention_days: z.number().int().min(7).max(3650).optional(),
    cost_threshold_usd: z.number().min(0).optional(),
    timeout_threshold_ms: z.number().int().min(0).optional(),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const project = await updateProjectSettings(projectId, parsed.data);
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.delete("/projects/:id", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);

  if (user) {
    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }
  } else {
    const project = await resolvedDeps.getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!project) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  if (await resolvedDeps.isPrimaryWorkspace(projectId)) {
    reply.code(409);
    return { error: "primary_workspace_protected" };
  }

  await resolvedDeps.deleteProject(projectId);
  return { ok: true };
});

app.post("/projects/:id/regenerate-api-key", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (!accessibleProject.permissions.can_rotate_api_keys) {
      reply.code(403);
      return { error: "forbidden" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const project = await regenerateProjectApiKey(projectId);
  if (!project) {
    reply.code(404);
    return { error: "not_found" };
  }

  return project;
});

app.get("/projects/:id/usage", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const summary = await getCloudProjectUsageSummary(projectId);
  if (!summary) {
    reply.code(404);
    return { error: "not_found" };
  }

  return summary;
});

app.get("/projects/:id/insights", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  return getProjectInsights(projectId);
});

app.get("/projects/:id/baseline", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  return {
    baseline: await getProjectBaseline(projectId),
  };
});

app.post("/projects/:id/baseline", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const bodySchema = z.object({
    trace_id: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const baseline = await setProjectBaseline(projectId, parsed.data.trace_id, user?.id ?? null);
  if (!baseline) {
    reply.code(400);
    return { error: "invalid_trace" };
  }

  return {
    baseline,
  };
});

app.get("/projects/:id/traces", async (request, reply) => {
  const projectId = (request.params as { id: string }).id;
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    framework: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });
  const parsed = querySchema.safeParse(request.query);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_query",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (user) {
    const accessibleProject = await getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }
  } else {
    const project = await getProject(projectId);
    if (project?.account_id) {
      reply.code(404);
      return { error: "not_found" };
    }
  }

  const result = await listTraces({
    projectId,
    page: parsed.data.page,
    pageSize: parsed.data.page_size,
    status: parsed.data.status,
    framework: parsed.data.framework,
    from: parsed.data.from,
    to: parsed.data.to,
  });

  return {
    traces: result.traces,
    total: result.total,
    page: parsed.data.page,
  };
});

app.get("/traces/:traceId", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  return trace;
});

app.get("/traces/:traceId/live", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  const canAccess = await canAccessTrace(user, traceId);
  if (!canAccess) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  const [graph, timeline] = trace
    ? await Promise.all([getTraceGraph(traceId, trace), getTraceTimeline(traceId, trace)])
    : [null, null];

  if (!trace || !graph || !timeline) {
    reply.code(404);
    return { error: "not_found" };
  }

  const now = Date.now();
  const lastActivityAt = trace.updated_at ?? trace.ended_at;
  const lastActivityMs = new Date(lastActivityAt).getTime();
  const startedAtMs = new Date(trace.started_at).getTime();
  const isRecentlyActive = now - lastActivityMs < 15_000;
  const startedRecently = now - startedAtMs < 10 * 60_000;
  const isLive = trace.status === "unset" || (isRecentlyActive && startedRecently);

  return {
    trace,
    graph,
    timeline,
    live: {
      is_live: isLive,
      last_activity_at: lastActivityAt,
    },
  };
});

app.get("/traces/:traceId/comparison", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  const canAccess = await canAccessTrace(user, traceId);
  if (!canAccess) {
    reply.code(404);
    return { error: "not_found" };
  }

  const comparison = await getTraceComparison(traceId);
  return {
    comparison,
  };
});

app.get("/traces/:traceId/graph", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const graph = await getTraceGraph(traceId);
  if (!graph) {
    reply.code(404);
    return { error: "not_found" };
  }

  return graph;
});

app.get("/traces/:traceId/timeline", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const timeline = await getTraceTimeline(traceId);
  if (!timeline) {
    reply.code(404);
    return { error: "not_found" };
  }

  return timeline;
});

app.get("/traces/:traceId/fork-drafts", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  return {
    drafts: await listForkDrafts(traceId),
  };
});

app.put("/traces/:traceId/fork-drafts/:spanId", async (request, reply) => {
  const params = request.params as { traceId: string; spanId: string };
  const bodySchema = z.object({
    payload: z.unknown(),
  });
  const parsed = bodySchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: parsed.error.message,
    };
  }

  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, params.traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(params.traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  const spanExists = trace.communication_spans.some((span) => span.span_id === params.spanId);
  if (!spanExists) {
    reply.code(404);
    return { error: "span_not_found" };
  }

  return upsertForkDraft(params.traceId, params.spanId, parsed.data.payload);
});

app.get("/traces/:traceId/agents/:agentId", async (request, reply) => {
  const params = request.params as { traceId: string; agentId: string };
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, params.traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const detail = await getAgentDetail(params.traceId, params.agentId);
  if (!detail) {
    reply.code(404);
    return { error: "not_found" };
  }

  return detail;
});

app.get("/traces/:traceId/failure-explanation", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  const planKey = await resolvedDeps.getProjectPlanKey(trace.project_id);
  if (planKey === "free") {
    reply.code(403);
    return { error: "failure_explanations_require_paid_plan" };
  }

  const hasFatalFailure = trace.mast_failures.some(
    (failure: { severity: string }) => failure.severity === "fatal",
  );
  if (!hasFatalFailure) {
    return { explanation: null };
  }

  const stored = await resolvedDeps.getStoredTraceFailureExplanation(traceId);
  if (stored) {
    return { explanation: stored };
  }

  try {
    const generated = await resolvedDeps.generateFailureExplanation(traceId);
    if (!generated) {
      reply.code(404);
      return { error: "not_found" };
    }

    const explanation = await resolvedDeps.upsertTraceFailureExplanation({
      traceId,
      projectId: generated.trace.project_id,
      summary: generated.explanation.summary,
      evidence: generated.explanation.evidence,
      recommendedFix: generated.explanation.recommended_fix,
      confidence: generated.explanation.confidence,
      keyStats: generated.explanation.key_stats,
      model: generated.explanation.model,
    });

    return { explanation };
  } catch (error) {
    if (error instanceof Error && error.message === "anthropic_not_configured") {
      reply.code(500);
      return { error: "failure_explanations_not_configured" };
    }
    if (error instanceof Error && error.message === "no_fatal_failure") {
      return { explanation: null };
    }
    reply.code(502);
    return { error: "failure_explanation_unavailable" };
  }
});

app.post("/traces/:traceId/failure-explanation", async (request, reply) => {
  const traceId = (request.params as { traceId: string }).traceId;
  const user = await getAuthenticatedUser(request.headers.authorization);
  if (!(await canAccessTrace(user, traceId))) {
    reply.code(404);
    return { error: "not_found" };
  }

  const trace = await getTrace(traceId);
  if (!trace) {
    reply.code(404);
    return { error: "not_found" };
  }

  const planKey = await resolvedDeps.getProjectPlanKey(trace.project_id);
  if (planKey === "free") {
    reply.code(403);
    return { error: "failure_explanations_require_paid_plan" };
  }

  const hasFatalFailure = trace.mast_failures.some(
    (failure: { severity: string }) => failure.severity === "fatal",
  );
  if (!hasFatalFailure) {
    reply.code(422);
    return { error: "no_fatal_failure" };
  }

  try {
    const generated = await resolvedDeps.generateFailureExplanation(traceId);
    if (!generated) {
      reply.code(404);
      return { error: "not_found" };
    }

    const explanation = await resolvedDeps.upsertTraceFailureExplanation({
      traceId,
      projectId: generated.trace.project_id,
      summary: generated.explanation.summary,
      evidence: generated.explanation.evidence,
      recommendedFix: generated.explanation.recommended_fix,
      confidence: generated.explanation.confidence,
      keyStats: generated.explanation.key_stats,
      model: generated.explanation.model,
    });

    return { explanation };
  } catch (error) {
    if (error instanceof Error && error.message === "anthropic_not_configured") {
      reply.code(500);
      return { error: "failure_explanations_not_configured" };
    }
    reply.code(502);
    return { error: "failure_explanation_unavailable" };
  }
});

  const dispatchFatalFailureAlert = async (traceId: string) => {
    const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
    const candidates = await resolvedDeps.getAlertCandidatesForTrace(traceId);
    if (!candidates) {
      return;
    }

    // Fetch stored LLM explanation if available — non-blocking, best-effort
    const storedExplanation = await resolvedDeps
      .getStoredTraceFailureExplanation(traceId)
      .catch(() => null);

    const payload = {
      event: "trace.fatal_failure",
      trace_id: candidates.trace_id,
      project_id: candidates.project_id,
      project_name: candidates.project_name,
      started_at: candidates.started_at,
      total_cost_usd: candidates.total_cost_usd,
      fatal_failures: candidates.fatal_failures.map(
        (f: { mode: string; agent_id: string | null; explanation: string }) => ({
          mode: f.mode,
          agent_id: f.agent_id,
          explanation: f.explanation,
        }),
      ),
      trace_url: `${appBaseUrl}/traces/${traceId}`,
      ...(storedExplanation
        ? {
            explanation_summary: storedExplanation.summary,
            recommended_fix: storedExplanation.recommended_fix,
          }
        : {}),
    };

    if (alertWebhookUrl) {
      await fetch(alertWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((error) => {
        app.log.warn({ error, traceId }, "Alert webhook dispatch failed");
      });
    }

    const projectTargets = await resolvedDeps.getProjectAlertDeliveryTargets(candidates.project_id);
    if (!projectTargets) {
      return;
    }

    const summary = formatFatalFailureSummary(payload.fatal_failures);
    const bodyLines = [
      `Workspace: ${payload.project_name}`,
      `Started: ${new Date(payload.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
      `Cost: ${formatUsd(payload.total_cost_usd)}`,
      `Root cause: ${summary || "Fatal failure detected"}`,
      ...(storedExplanation
        ? [
            ``,
            `What happened: ${storedExplanation.summary}`,
            `Recommended fix: ${storedExplanation.recommended_fix}`,
          ]
        : []),
    ];

    if (projectTargets.slack_webhook_url) {
      try {
        await sendSlackAlert({
          webhookUrl: projectTargets.slack_webhook_url,
          title: `Fatal failure in ${payload.project_name}`,
          bodyLines,
          actionUrl: payload.trace_url,
        });
        await resolvedDeps.recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "slack",
          eventType: "fatal_failure",
          status: "sent",
          traceId,
          targetLabel: maskSlackTarget(projectTargets.slack_webhook_url),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await resolvedDeps.recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "slack",
          eventType: "fatal_failure",
          status: "failed",
          traceId,
          targetLabel: maskSlackTarget(projectTargets.slack_webhook_url),
          error: message,
        });
        app.log.warn({ error, traceId }, "Slack fatal alert dispatch failed");
      }
    }

    if (projectTargets.alert_email) {
      try {
        const escapedProjectName = escapeHtml(payload.project_name);
        const escapedSummary = escapeHtml(summary || "A fatal failure was detected.");
        const escapedStoredSummary = storedExplanation ? escapeHtml(storedExplanation.summary) : "";
        const escapedRecommendedFix = storedExplanation
          ? escapeHtml(storedExplanation.recommended_fix)
          : "";

        await sendAlertEmail({
          to: projectTargets.alert_email,
          subject: `Rifft fatal failure: ${payload.project_name}`,
          html: `<p><strong>${escapedProjectName}</strong> recorded a fatal failure.</p><p>${escapedSummary}</p><p>Started: ${payload.started_at}<br />Cost: ${formatUsd(payload.total_cost_usd)}</p>${storedExplanation ? `<p style="border-left:3px solid #c00;padding-left:12px;margin:16px 0"><strong>What happened:</strong> ${escapedStoredSummary}</p><p style="border-left:3px solid #888;padding-left:12px;margin:16px 0"><strong>Recommended fix:</strong> ${escapedRecommendedFix}</p>` : ""}<p><a href="${payload.trace_url}">Open trace in Rifft</a></p>`,
          text: `${payload.project_name} recorded a fatal failure.\n\n${summary || "A fatal failure was detected."}\n\nStarted: ${payload.started_at}\nCost: ${formatUsd(payload.total_cost_usd)}${storedExplanation ? `\n\nWhat happened: ${storedExplanation.summary}\n\nRecommended fix: ${storedExplanation.recommended_fix}` : ""}\n\nOpen trace: ${payload.trace_url}`,
        });
        await resolvedDeps.recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "email",
          eventType: "fatal_failure",
          status: "sent",
          traceId,
          targetLabel: projectTargets.alert_email,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await resolvedDeps.recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "email",
          eventType: "fatal_failure",
          status: "failed",
          traceId,
          targetLabel: projectTargets.alert_email,
          error: message,
        });
        app.log.warn({ error, traceId }, "Email fatal alert dispatch failed");
      }
    }
  };

  const dispatchRegressionDigest = async (projectId: string) => {
    const alertSettings = await resolvedDeps.getProjectAlertSettings(projectId);
    if (!alertSettings?.regression_available || !alertSettings.regression_digest_enabled) {
      return { skipped: true, reason: "not_enabled" };
    }

    const targets = (await resolvedDeps.pgQuery(
      `SELECT slack_webhook_url, alert_email, name, created_at FROM projects WHERE id = $1 LIMIT 1`,
      [projectId],
    )) as { rows: Array<{ slack_webhook_url: string | null; alert_email: string | null; name: string; created_at: string | Date }>; rowCount: number | null };
    if (!targets.rowCount || !targets.rows[0]) {
      return { skipped: true, reason: "project_not_found" };
    }
    const { slack_webhook_url, alert_email, name: projectName, created_at } = targets.rows[0];

    // Skip the digest for projects younger than 7 days — the first-week
    // span/trace deltas are always 0/0 which looks broken to the reader.
    const projectAgeMs = Date.now() - new Date(created_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (projectAgeMs < sevenDaysMs) {
      return { skipped: true, reason: "project_too_new" };
    }

    if (!slack_webhook_url && !alert_email) {
      return { skipped: true, reason: "no_destination" };
    }

    // Gather richer weekly stats alongside regression detection and correlation findings
    const [regressions, stats, correlations] = await Promise.all([
      resolvedDeps.detectRegressions(projectId),
      resolvedDeps.getWeeklyDigestStats(projectId),
      resolvedDeps.getTraceAttributeCorrelations(projectId).catch(() => []),
    ]);

    // Skip only if there were zero traces this week (nothing to report)
    if (stats.traces_this_week === 0) {
      return { skipped: true, reason: "no_activity" };
    }

    const formatRate = (rate: number) => `${Math.round(rate * 100)}%`;
    const formatMode = (mode: string) =>
      mode.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
    const formatNumber = (n: number) =>
      n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n);
    const formatMs = (ms: number) =>
      ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

    const spanTrend =
      stats.spans_last_week > 0
        ? Math.round(
            ((stats.spans_this_week - stats.spans_last_week) / stats.spans_last_week) * 100,
          )
        : null;
    const spanTrendStr =
      spanTrend === null
        ? "first week"
        : spanTrend > 0
        ? `+${spanTrend}% vs last week`
        : spanTrend < 0
        ? `${spanTrend}% vs last week`
        : "same as last week";

    const topRegressions = regressions.slice(0, 5);
    const ctaUrl =
      stats.worst_trace_id
        ? `${appBaseUrl}/traces/${stats.worst_trace_id}`
        : `${appBaseUrl}/traces`;

    // ── Email HTML ────────────────────────────────────────────────────────────

    const summaryCards = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
            <div style="font-family:sans-serif;font-size:22px;font-weight:600;color:#111">${formatNumber(stats.spans_this_week)}</div>
            <div style="font-family:sans-serif;font-size:12px;color:#666;margin-top:2px">spans</div>
            <div style="font-family:sans-serif;font-size:11px;color:#888;margin-top:2px">${spanTrendStr}</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
            <div style="font-family:sans-serif;font-size:22px;font-weight:600;color:#111">${stats.traces_this_week}</div>
            <div style="font-family:sans-serif;font-size:12px;color:#666;margin-top:2px">traces</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px 16px;background:${stats.fatal_traces_this_week > 0 ? "#fff5f5" : "#f9f9f9"};border-radius:8px;text-align:center;width:25%">
            <div style="font-family:sans-serif;font-size:22px;font-weight:600;color:${stats.fatal_traces_this_week > 0 ? "#c00" : "#111"}">${stats.fatal_traces_this_week}</div>
            <div style="font-family:sans-serif;font-size:12px;color:#666;margin-top:2px">fatal failures</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:8px;text-align:center;width:25%">
            <div style="font-family:sans-serif;font-size:22px;font-weight:600;color:#111">${regressions.length}</div>
            <div style="font-family:sans-serif;font-size:12px;color:#666;margin-top:2px">regressions</div>
          </td>
        </tr>
      </table>
    `;

    const agentRows =
      stats.top_agents.length > 0
        ? stats.top_agents
            .map(
              (a) =>
                `<tr>
                  <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px">${a.agent_id}</td>
                  <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right">${formatNumber(a.span_count)}</td>
                  <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right">${formatMs(a.avg_duration_ms)} avg</td>
                </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" style="padding:12px;font-family:sans-serif;font-size:13px;color:#888">No agent spans recorded this week.</td></tr>`;

    const fmtCorrelationAttr = (attr: string) =>
      attr === "max_input_tokens"
        ? "peak input tokens"
        : attr === "total_cost_usd"
        ? "total cost"
        : "duration";
    const fmtCorrelationThreshold = (attr: string, value: number) =>
      attr === "total_cost_usd"
        ? `$${value.toFixed(4)}`
        : attr === "max_input_tokens"
        ? value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : String(Math.round(value))
        : value >= 1000
        ? `${(value / 1000).toFixed(1)}s`
        : `${Math.round(value)}ms`;

    const correlationRows =
      correlations.length > 0
        ? correlations
            .map(
              (c) =>
                `<tr>
                  <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px">
                    ${c.fatal_traces_above} of ${c.total_traces_above} traces with ${fmtCorrelationAttr(c.attribute)} &gt; ${fmtCorrelationThreshold(c.attribute, c.threshold)} were fatal
                    <span style="font-size:11px;color:#888"> (vs ${Math.round(c.failure_rate_below * 100)}% below)</span>
                  </td>
                  <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right;color:#c00;font-weight:600">
                    ${Math.round(c.failure_rate_above * 100)}% fatal
                  </td>
                </tr>`,
            )
            .join("")
        : "";

    const regressionRows =
      topRegressions.length > 0
        ? topRegressions
            .map((r) => {
              const deltaStr =
                r.historical_rate === 0
                  ? "New this week"
                  : `+${Math.round(r.rate_delta * 100)}pp vs prior 3w`;
              const agentStr = r.dominant_agent_id
                ? `<br/><span style="font-size:11px;color:#888">${r.dominant_agent_id}</span>`
                : "";
              return `<tr>
                <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px">${r.severity === "fatal" ? "⚠️ " : "• "}${formatMode(r.mode)}${agentStr}</td>
                <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right">${formatRate(r.recent_rate)}</td>
                <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right">${formatRate(r.historical_rate)}</td>
                <td style="padding:7px 12px;border-bottom:1px solid #eee;font-family:sans-serif;font-size:13px;text-align:right">${deltaStr}</td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="4" style="padding:12px;font-family:sans-serif;font-size:13px;color:#888">No regressions detected — failure rates are stable.</td></tr>`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#fff">
        <table style="max-width:600px;margin:32px auto;padding:0 16px" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="font-family:sans-serif;font-size:12px;color:#aaa;margin:0 0 20px">
                Rifft · Weekly digest · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>

              <h1 style="font-family:sans-serif;font-size:22px;font-weight:600;color:#111;margin:0 0 4px">
                ${projectName}
              </h1>
              <p style="font-family:sans-serif;font-size:14px;color:#666;margin:0 0 24px">
                Here's how your agents performed over the last 7 days.
              </p>

              ${summaryCards}

              <h2 style="font-family:sans-serif;font-size:15px;font-weight:600;color:#111;margin:0 0 8px">Top agents by activity</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
                <thead>
                  <tr style="background:#f5f5f5">
                    <th style="padding:7px 12px;text-align:left;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Agent</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Spans</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Duration</th>
                  </tr>
                </thead>
                <tbody>${agentRows}</tbody>
              </table>

              <h2 style="font-family:sans-serif;font-size:15px;font-weight:600;color:#111;margin:0 0 8px">Regressions detected</h2>
              <p style="font-family:sans-serif;font-size:13px;color:#666;margin:0 0 10px">
                Failure modes that increased significantly vs the prior 3 weeks.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
                <thead>
                  <tr style="background:#f5f5f5">
                    <th style="padding:7px 12px;text-align:left;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Failure mode</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">This week</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Baseline</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Change</th>
                  </tr>
                </thead>
                <tbody>${regressionRows}</tbody>
              </table>

              ${correlations.length > 0 ? `
              <h2 style="font-family:sans-serif;font-size:15px;font-weight:600;color:#111;margin:0 0 8px">Failure patterns detected</h2>
              <p style="font-family:sans-serif;font-size:13px;color:#666;margin:0 0 10px">
                Attributes that strongly predict fatal traces in the last 30 days.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
                <thead>
                  <tr style="background:#f5f5f5">
                    <th style="padding:7px 12px;text-align:left;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Pattern</th>
                    <th style="padding:7px 12px;text-align:right;font-family:sans-serif;font-size:12px;color:#555;font-weight:600">Fatal rate</th>
                  </tr>
                </thead>
                <tbody>${correlationRows}</tbody>
              </table>
              ` : ""}

              <table style="margin-bottom:32px" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#111;border-radius:6px">
                    <a href="${ctaUrl}" style="display:inline-block;padding:10px 20px;font-family:sans-serif;font-size:14px;font-weight:500;color:#fff;text-decoration:none">
                      ${stats.worst_trace_id && stats.fatal_traces_this_week > 0 ? "Inspect worst trace →" : "Open workspace →"}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-family:sans-serif;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px">
                You're receiving this because weekly digest is enabled for ${projectName}.
                Manage alert settings at <a href="${appBaseUrl}/settings" style="color:#bbb">${appBaseUrl}/settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const emailText = [
      `Rifft weekly digest: ${projectName}`,
      `Week ending ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      "",
      `Spans: ${formatNumber(stats.spans_this_week)} (${spanTrendStr})`,
      `Traces: ${stats.traces_this_week}`,
      `Fatal failures: ${stats.fatal_traces_this_week}`,
      `Regressions: ${regressions.length}`,
      "",
      ...(stats.top_agents.length > 0
        ? [
            "Top agents:",
            ...stats.top_agents.map(
              (a) => `  ${a.agent_id}: ${formatNumber(a.span_count)} spans, ${formatMs(a.avg_duration_ms)} avg`,
            ),
            "",
          ]
        : []),
      ...(topRegressions.length > 0
        ? [
            "Regressions:",
            ...topRegressions.map((r) => {
              const deltaStr =
                r.historical_rate === 0
                  ? "new this week"
                  : `up from ${formatRate(r.historical_rate)} (+${Math.round(r.rate_delta * 100)}pp)`;
              return `  ${formatMode(r.mode)}: ${formatRate(r.recent_rate)} of traces (${deltaStr})`;
            }),
            "",
          ]
        : ["No regressions detected this week.", ""]),
      ...(correlations.length > 0
        ? [
            "Failure patterns:",
            ...correlations.map(
              (c) =>
                `  ${c.fatal_traces_above} of ${c.total_traces_above} traces with ${fmtCorrelationAttr(c.attribute)} > ${fmtCorrelationThreshold(c.attribute, c.threshold)} were fatal (vs ${Math.round(c.failure_rate_below * 100)}% below threshold)`,
            ),
            "",
          ]
        : []),
      ctaUrl,
    ].join("\n");

    // ── Slack body ─────────────────────────────────────────────────────────────

    const slackBodyLines = [
      `*${formatNumber(stats.spans_this_week)} spans* · ${stats.traces_this_week} traces · ${stats.fatal_traces_this_week} fatal failures (${spanTrendStr})`,
      ...(topRegressions.length > 0
        ? [
            "",
            ...topRegressions.map((r) => {
              const deltaStr =
                r.historical_rate === 0
                  ? `new, ${r.recent_affected_count} trace${r.recent_affected_count === 1 ? "" : "s"}`
                  : `up from ${formatRate(r.historical_rate)} (+${Math.round(r.rate_delta * 100)}pp)`;
              const agentStr = r.dominant_agent_id ? ` — ${r.dominant_agent_id}` : "";
              return `${r.severity === "fatal" ? "⚠️" : "•"} ${formatMode(r.mode)}: ${formatRate(r.recent_rate)} (${deltaStr})${agentStr}`;
            }),
          ]
        : ["No regressions detected — failure rates are stable."]),
      ...(correlations.length > 0
        ? [
            "",
            "*Failure patterns:*",
            ...correlations.map(
              (c) =>
                `📊 ${c.fatal_traces_above}/${c.total_traces_above} traces with ${fmtCorrelationAttr(c.attribute)} > ${fmtCorrelationThreshold(c.attribute, c.threshold)} were fatal (${Math.round(c.failure_rate_above * 100)}% vs ${Math.round(c.failure_rate_below * 100)}% below)`,
            ),
          ]
        : []),
    ];

    // ── Dispatch ───────────────────────────────────────────────────────────────

    const results: { slack?: string; email?: string } = {};
    const digestSubject =
      regressions.length > 0
        ? `Rifft weekly digest: ${regressions.length} regression${regressions.length === 1 ? "" : "s"} in ${projectName}`
        : `Rifft weekly digest: ${projectName} — ${stats.traces_this_week} traces this week`;

    if (slack_webhook_url) {
      try {
        await sendSlackAlert({
          webhookUrl: slack_webhook_url,
          title: `Weekly digest: ${projectName}`,
          bodyLines: slackBodyLines,
          actionUrl: ctaUrl,
        });
        await resolvedDeps.recordProjectAlertDelivery({
          projectId,
          channel: "slack",
          eventType: "regression_digest",
          status: "sent",
          targetLabel: maskSlackTarget(slack_webhook_url),
        });
        results.slack = "sent";
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await resolvedDeps.recordProjectAlertDelivery({
          projectId,
          channel: "slack",
          eventType: "regression_digest",
          status: "failed",
          targetLabel: maskSlackTarget(slack_webhook_url),
          error: message,
        });
        results.slack = "failed";
      }
    }

    if (alert_email) {
      try {
        await sendAlertEmail({
          to: alert_email,
          subject: digestSubject,
          html: emailHtml,
          text: emailText,
        });
        await resolvedDeps.recordProjectAlertDelivery({
          projectId,
          channel: "email",
          eventType: "regression_digest",
          status: "sent",
          targetLabel: alert_email,
        });
        results.email = "sent";
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await resolvedDeps.recordProjectAlertDelivery({
          projectId,
          channel: "email",
          eventType: "regression_digest",
          status: "failed",
          targetLabel: alert_email,
          error: message,
        });
        results.email = "failed";
      }
    }

    return { skipped: false, regressions: regressions.length, traces: stats.traces_this_week, results };
  };

  const dispatchThresholdAlert = async (traceId: string) => {
    const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!alertWebhookUrl) {
      return;
    }

    const trace = await resolvedDeps.getTrace(traceId);
    if (!trace) {
      return;
    }

    const project = await resolvedDeps.getProject(trace.project_id);
    if (!project) {
      return;
    }

    const violations: Array<{ type: string; value: number; threshold: number }> = [];

    if (project.cost_threshold_usd > 0 && trace.total_cost_usd > project.cost_threshold_usd) {
      violations.push({
        type: "cost_exceeded",
        value: trace.total_cost_usd,
        threshold: project.cost_threshold_usd,
      });
    }

    if (project.timeout_threshold_ms > 0 && trace.duration_ms > project.timeout_threshold_ms) {
      violations.push({
        type: "timeout_exceeded",
        value: trace.duration_ms,
        threshold: project.timeout_threshold_ms,
      });
    }

    if (violations.length === 0) {
      return;
    }

    const payload = {
      event: "trace.threshold_exceeded",
      trace_id: traceId,
      project_id: trace.project_id,
      project_name: project.name,
      started_at: trace.started_at,
      total_cost_usd: trace.total_cost_usd,
      duration_ms: trace.duration_ms,
      violations,
      trace_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rifft.dev"}/traces/${traceId}`,
    };

    await fetch(alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((error) => {
      app.log.warn({ error, traceId }, "Threshold alert webhook dispatch failed");
    });
  };

  app.post("/internal/traces/:traceId/alert", async (request, reply) => {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const provided = request.headers["x-internal-secret"];
      if (provided !== internalSecret) {
        reply.code(401);
        return { error: "unauthorized" };
      }
    }

    const traceId = (request.params as { traceId: string }).traceId;
    await Promise.all([dispatchFatalFailureAlert(traceId), dispatchThresholdAlert(traceId)]);
    return { ok: true };
  });

  app.post("/internal/projects/:id/regression-digest", async (request, reply) => {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const provided = request.headers["x-internal-secret"];
      if (provided !== internalSecret) {
        reply.code(401);
        return { error: "unauthorized" };
      }
    }

    const projectId = (request.params as { id: string }).id;
    const planKey = await resolvedDeps.getProjectPlanKey(projectId);
    if (planKey !== "scale") {
      reply.code(403);
      return { error: "scale_plan_required" };
    }
    const result = await dispatchRegressionDigest(projectId);
    return result;
  });

  // Batch endpoint: fire the weekly digest for every eligible Scale project.
  // Call this once per week from a cron job or scheduler (e.g. Mondays at 9am).
  app.post("/internal/weekly-digest", async (request, reply) => {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const provided = request.headers["x-internal-secret"];
      if (provided !== internalSecret) {
        reply.code(401);
        return { error: "unauthorized" };
      }
    }

    const projects = await resolvedDeps.getScaleProjectsWithDigestEnabled();
    app.log.info({ count: projects.length }, "Starting weekly digest batch");

    const results = await Promise.allSettled(
      projects.map(async ({ project_id }) => {
        try {
          const result = await dispatchRegressionDigest(project_id);
          return { project_id, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown_error";
          app.log.error({ project_id, error: message }, "Weekly digest failed for project");
          return { project_id, skipped: true, reason: message };
        }
      }),
    );

    const summary = results.map((r) =>
      r.status === "fulfilled" ? r.value : { project_id: "unknown", skipped: true, reason: "promise_rejected" },
    );

    const sent = summary.filter((r) => !r.skipped).length;
    const skipped = summary.filter((r) => r.skipped).length;

    app.log.info({ sent, skipped }, "Weekly digest batch complete");
    return { ok: true, sent, skipped, projects: summary };
  });

  app.get("/projects/:id/members", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject) {
      reply.code(404);
      return { error: "not_found" };
    }

    return { members: await resolvedDeps.listProjectMembers(projectId) };
  });

  app.post("/projects/:id/members", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const bodySchema = z.object({
      email: z.string().email(),
      role: z.literal("member").default("member"),
    });
    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", message: parsed.error.message };
    }

    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const result = await resolvedDeps.addProjectMember(projectId, user.id, parsed.data.email);

    if (!result.ok) {
      const status = result.reason === "forbidden"
        ? 403
        : result.reason === "already_member"
          ? 409
          : result.reason === "cannot_invite_self"
            ? 422
            : result.reason === "member_limit_reached"
              ? 403
              : 400;
      reply.code(status);
      return { error: result.reason };
    }

    reply.code(201);
    return { ok: true, pending: result.reason === "pending" };
  });

  app.delete("/projects/:id/members", async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    const bodySchema = z.union([
      z.object({ user_id: z.string().min(1) }),
      z.object({ pending_email: z.string().email() }),
    ]);
    const parsed = bodySchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", message: parsed.error.message };
    }

    const user = await resolvedDeps.getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const accessibleProject = await resolvedDeps.getAccessibleProject(user.id, projectId);
    if (!accessibleProject?.permissions.can_update_settings) {
      reply.code(403);
      return { error: "forbidden" };
    }

    if ("pending_email" in parsed.data) {
      const result = await resolvedDeps.pgQuery(
        `DELETE FROM pending_project_invites WHERE project_id = $1 AND invitee_email = $2`,
        [projectId, parsed.data.pending_email],
      ) as { rowCount?: number };

      if (!result.rowCount) {
        reply.code(404);
        return { error: "pending_invite_not_found" };
      }

      return { ok: true };
    }

    const removeInput = buildRemoveMemberInput(projectId, user.id, parsed.data.user_id);
    const result = await resolvedDeps.removeProjectMember(
      removeInput.projectId,
      removeInput.removerUserId,
      removeInput.targetUserId,
    );

    if (!result.ok) {
      const status = result.reason === "forbidden"
        ? 403
        : result.reason === "cannot_remove_owner"
          ? 422
          : result.reason === "member_not_found"
            ? 404
            : 400;
      reply.code(status);
      return { error: result.reason };
    }

    return { ok: true };
  });

  return app;
};

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  process.on("SIGINT", () => void closePools());
  process.on("SIGTERM", () => void closePools());

  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET must be set when Stripe billing is enabled");
  }

  const app = createApp();
  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
