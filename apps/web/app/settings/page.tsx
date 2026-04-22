import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getCloudProjects,
  getOptimizationSuggestions,
  getProjectAlerts,
  getProjectSettings,
  getProjectUsageSummary,
} from "../lib/api";
import { requireCloudProject } from "../lib/require-cloud-project";
import { ApiKeyCard } from "./api-key-card";
import { AlertsCard } from "./alerts-card";
import { OptimizationCard } from "./optimization-card";
import { CorrelationCard } from "./correlation-card";
import { AgentDiffCard } from "./agent-diff-card";
import { InviteMemberCard } from "../invite-member-card";
import { ManageBillingButton } from "./manage-billing-button";
import { RefreshStatusButton } from "./refresh-status-button";
import { SettingsForm } from "./settings-form";
import { UpgradeButton } from "./upgrade-button";
import { WorkspaceManagerCard } from "./workspace-manager-card";

const formatSpanCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  await requireCloudProject("/settings");
  const [project, usageSummary, cloudProjects, alerts] = await Promise.all([
    getProjectSettings(),
    getProjectUsageSummary(),
    getCloudProjects(),
    getProjectAlerts(),
  ]);

  // Fetch optimisation suggestions only for Scale — the endpoint returns 403 for other plans
  const isScalePlan = usageSummary.plan.key === "scale";
  const optimizationResult = isScalePlan
    ? await getOptimizationSuggestions().catch(() => null)
    : null;
  const workspaces = [...cloudProjects.projects].sort((a, b) => {
    const left = new Date(a.created_at).getTime();
    const right = new Date(b.created_at).getTime();
    if (left !== right) {
      return left - right;
    }
    return a.id.localeCompare(b.id);
  });
  const primaryWorkspaceId = workspaces[0]?.id ?? null;
  const usagePercentage = Math.round(usageSummary.usage.usage_ratio * 100);
  const checkoutState =
    typeof params?.checkout === "string"
      ? params.checkout
      : Array.isArray(params?.checkout)
        ? params?.checkout[0]
        : null;
  const showCheckoutBanner = checkoutState === "success";
  const isPaidPlan = ["pro", "scale"].includes(usageSummary.plan.key);
  const isFreePlan = !isPaidPlan;
  const currentPeriodEnd = usageSummary.plan.current_period_end
    ? new Date(usageSummary.plan.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      {!project.permissions.can_update_settings && (
        <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          You have read-only access to this workspace. Contact the workspace owner
          to change settings, rotate the API key, or manage billing.
        </div>
      )}
      <section className="space-y-3">
        <Badge variant="outline">Settings</Badge>
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Settings</h1>
          <p className="max-w-2xl text-muted-foreground">
            Manage billing, API access, alert thresholds, and team access.
          </p>
        </div>
      </section>

      {showCheckoutBanner ? (
        <section
          className={`rounded-3xl border p-6 shadow-sm ${
            isPaidPlan
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {isPaidPlan
                  ? `${usageSummary.plan.name} is active`
                  : "Checkout complete. Waiting for billing sync."}
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {isPaidPlan
                  ? `Your account is now on ${usageSummary.plan.name}${currentPeriodEnd ? ` through ${currentPeriodEnd}` : ""}.`
                  : "Stripe has sent you back to Rifft. If this page still shows Cloud Free, the webhook is probably still landing. Refresh in a moment and it should flip automatically."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!isPaidPlan ? (
                <RefreshStatusButton />
              ) : null}
              <Button asChild className="w-full sm:w-auto">
                <a href="/settings">Continue</a>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Card className="rounded-3xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Plan and billing</CardTitle>
            <Badge variant={isPaidPlan ? "default" : "outline"}>{usageSummary.plan.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This workspace is on {usageSummary.plan.name}. Billing is shared across this account's
              workspaces.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {formatSpanCount(usageSummary.usage.used_spans)} of{" "}
                {formatSpanCount(usageSummary.usage.included_spans)} spans used this month
              </span>
              <span>{usageSummary.plan.retention_days}-day retention</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${
                  usageSummary.usage.over_limit ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span>
                {usageSummary.plan.support === "priority"
                  ? "Priority support"
                  : usageSummary.plan.support === "email"
                    ? "Email support"
                    : "Community support"}
              </span>
              {usageSummary.plan.overage_price_per_100k_usd ? (
                <span>
                  ${usageSummary.plan.overage_price_per_100k_usd} per 100K spans over the limit
                </span>
              ) : null}
            </div>
          </div>
          <Separator />
          {isFreePlan ? (
            <UpgradeButton
              accountId={usageSummary.plan.account_id ?? ""}
              userEmail={project.owner_email ?? null}
              canManage={project.permissions.can_manage_billing}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {project.permissions.can_manage_billing ? <ManageBillingButton /> : null}
              {usageSummary.plan.cancel_at_period_end ? (
                <Badge variant="outline">Cancels at period end</Badge>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>API key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ApiKeyCard
            apiKey={project.api_key}
            projectId={project.id}
            canRotate={project.permissions.can_rotate_api_keys}
          />
          <p className="text-sm text-muted-foreground">
            Rotating the key immediately invalidates all active SDK connections.
          </p>
        </CardContent>
      </Card>

      <AlertsCard
        projectId={project.id}
        alerts={alerts}
        canManage={project.permissions.can_update_settings}
      />

      {optimizationResult ? (
        <OptimizationCard result={optimizationResult} />
      ) : null}

      {isPaidPlan ? <CorrelationCard projectId={project.id} /> : null}

      {isPaidPlan ? <AgentDiffCard projectId={project.id} /> : null}

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Alert thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set these to flag expensive or slow traces. Threshold webhooks still post to{" "}
            <code>ALERT_WEBHOOK_URL</code>. Set either value to 0 to disable it.
          </p>
          <SettingsForm
            projectId={project.id}
            retentionDays={project.retention_days}
            costThresholdUsd={project.cost_threshold_usd}
            timeoutThresholdMs={project.timeout_threshold_ms}
            retentionManagedByPlan={Boolean(project.account_id)}
            canUpdateSettings={project.permissions.can_update_settings}
          />
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h3 className="font-medium">Team members</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Invite teammates to give them access to this workspace.
            </p>
            <InviteMemberCard
              projectId={project.id}
              canManage={project.permissions.can_update_settings}
              isFreePlan={isFreePlan}
              workspaceName={project.name}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader id="workspaces">
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceManagerCard
            workspaces={workspaces}
            currentProjectId={project.id}
            primaryWorkspaceId={primaryWorkspaceId}
            canManage={project.permissions.can_manage_billing}
            canCreateWorkspace={
              project.permissions.can_manage_billing && usageSummary.plan.key !== "free"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
