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
  consumePendingInvites,
  isPrimaryWorkspace,
  type ProjectAlertChannel,
} from "./queries.js";

const port = Number(process.env.PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL ?? "";
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "";
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

type AppDeps = {
  getAuthenticatedUser: typeof getAuthenticatedUser;
  getAccessibleProject: typeof getAccessibleProject;
  getProject: typeof getProject;
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

  app.get("/health", async () => ({
    status: "ok",
    service: "api",
    dependencies: {
      postgresConfigured: databaseUrl.length > 0,
      clickhouseConfigured: clickhouseUrl.length > 0,
      supabaseConfigured: supabaseUrl.length > 0,
    },
  }));

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

  const dispatchFatalFailureAlert = async (traceId: string) => {
    const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
    const candidates = await getAlertCandidatesForTrace(traceId);
    if (!candidates) {
      return;
    }

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

    const projectTargets = await getProjectAlertDeliveryTargets(candidates.project_id);
    if (!projectTargets) {
      return;
    }

    const summary = formatFatalFailureSummary(payload.fatal_failures);
    const bodyLines = [
      `Workspace: ${payload.project_name}`,
      `Started: ${new Date(payload.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
      `Cost: ${formatUsd(payload.total_cost_usd)}`,
      `Root cause: ${summary || "Fatal failure detected"}`,
    ];

    if (projectTargets.slack_webhook_url) {
      try {
        await sendSlackAlert({
          webhookUrl: projectTargets.slack_webhook_url,
          title: `Fatal failure in ${payload.project_name}`,
          bodyLines,
          actionUrl: payload.trace_url,
        });
        await recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "slack",
          eventType: "fatal_failure",
          status: "sent",
          traceId,
          targetLabel: maskSlackTarget(projectTargets.slack_webhook_url),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await recordProjectAlertDelivery({
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
        await sendAlertEmail({
          to: projectTargets.alert_email,
          subject: `Rifft fatal failure: ${payload.project_name}`,
          html: `<p><strong>${payload.project_name}</strong> recorded a fatal failure.</p><p>${summary || "A fatal failure was detected."}</p><p>Started: ${payload.started_at}<br />Cost: ${formatUsd(payload.total_cost_usd)}</p><p><a href="${payload.trace_url}">Open trace in Rifft</a></p>`,
          text: `${payload.project_name} recorded a fatal failure.\n\n${summary || "A fatal failure was detected."}\n\nStarted: ${payload.started_at}\nCost: ${formatUsd(payload.total_cost_usd)}\n\nOpen trace: ${payload.trace_url}`,
        });
        await recordProjectAlertDelivery({
          projectId: candidates.project_id,
          channel: "email",
          eventType: "fatal_failure",
          status: "sent",
          traceId,
          targetLabel: projectTargets.alert_email,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "alert_send_failed";
        await recordProjectAlertDelivery({
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

  const dispatchThresholdAlert = async (traceId: string) => {
    const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!alertWebhookUrl) {
      return;
    }

    const trace = await getTrace(traceId);
    if (!trace) {
      return;
    }

    const project = await getProject(trace.project_id);
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
