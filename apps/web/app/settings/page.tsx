import { Activity, RadioTower, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProjectSettings, getProjectUsageSummary } from "../lib/api";
import { redirectToBootstrap, requireCloudProject } from "../lib/require-cloud-project";
import { ApiKeyCard } from "./api-key-card";
import { ManageBillingButton } from "./manage-billing-button";
import { SettingsForm } from "./settings-form";

const formatSpanCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  await requireCloudProject("/settings");
  const [project, usageSummary] = await Promise.all([
    getProjectSettings(),
    getProjectUsageSummary(),
  ]).catch(() => redirectToBootstrap("/settings"));
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "https://ingest.rifft.dev";
  const usagePercentage = Math.round(usageSummary.usage.usage_ratio * 100);
  const checkoutState =
    typeof params?.checkout === "string"
      ? params.checkout
      : Array.isArray(params?.checkout)
        ? params?.checkout[0]
        : null;
  const showCheckoutBanner = checkoutState === "success";
  const isPaidPlan = usageSummary.plan.key === "pro";
  const currentPeriodEnd = usageSummary.plan.current_period_end
    ? new Date(usageSummary.plan.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const lastSyncedAt = usageSummary.plan.last_synced_at
    ? new Date(usageSummary.plan.last_synced_at).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.12,transparent_24%),radial-gradient(circle_at_bottom_right,hsl(var(--chart-2))/0.12,transparent_26%),hsl(var(--card))] p-8 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <Badge variant="outline">Project settings</Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight">{project.name}</h1>
              <p className="font-mono text-xs text-muted-foreground">{project.id}</p>
              <p className="max-w-2xl text-muted-foreground">
                Keep the hosted project healthy: watch billing state, usage, retention, and ingest
                credentials without leaving the product context.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-background/65 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" />
                Plan
              </div>
              <div className="mt-2 text-2xl font-semibold">{usageSummary.plan.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {usageSummary.plan.retention_days}-day trace retention
              </div>
            </div>
            <div className="rounded-2xl border bg-background/65 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4" />
                Usage
              </div>
              <div className="mt-2 text-2xl font-semibold">{usagePercentage}%</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatSpanCount(usageSummary.usage.used_spans)} of {formatSpanCount(usageSummary.usage.included_spans)} spans this month
              </div>
            </div>
          </div>
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
                {isPaidPlan ? "Cloud Pro is active" : "Checkout complete. Waiting for billing sync."}
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {isPaidPlan
                  ? `Your account is now on Cloud Pro${currentPeriodEnd ? ` through ${currentPeriodEnd}` : ""}.`
                  : "Polar has sent you back to Rifft. If this page still shows Cloud Free, the webhook is probably still landing. Refresh in a moment and it should flip automatically."}
              </p>
            </div>
            <div className="flex gap-2">
              {!isPaidPlan ? (
                <Button asChild variant="outline">
                  <a href="/settings?checkout=success">Refresh status</a>
                </Button>
              ) : null}
              <Button asChild>
                <a href="/settings">Continue</a>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Project setup and billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-[1.5rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.08,transparent_28%),hsl(var(--muted))/0.25] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  {formatSpanCount(usageSummary.usage.used_spans)} of{" "}
                  {formatSpanCount(usageSummary.usage.included_spans)} spans used this month
                </div>
                <Badge variant={usageSummary.plan.key === "pro" ? "default" : "outline"}>
                  {usageSummary.plan.key === "pro" ? "Paid" : "Free"}
                </Badge>
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
                  {usageSummary.plan.support === "email" ? "Email support" : "Community support"}
                </span>
                {usageSummary.plan.overage_price_per_100k_usd ? (
                  <span>
                    ${usageSummary.plan.overage_price_per_100k_usd} per 100K spans over the limit
                  </span>
                ) : null}
              </div>
              {usageSummary.plan.key === "pro" ? (
                <div className="flex flex-wrap gap-2">
                  {project.permissions.can_manage_billing ? <ManageBillingButton /> : null}
                  {usageSummary.plan.cancel_at_period_end ? (
                    <Badge variant="outline">Cancels at period end</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <ApiKeyCard
              apiKey={project.api_key}
              projectId={project.id}
              canRotate={project.permissions.can_rotate_api_keys}
            />
            <Separator />
            <div className="space-y-3">
              <h3 className="font-medium">Project thresholds</h3>
              <p className="text-sm text-muted-foreground">
                Use these guardrails to catch slow or expensive runs sooner.
              </p>
              <SettingsForm
                projectId={project.id}
                retentionDays={project.retention_days}
                costThresholdUsd={project.cost_threshold_usd}
                timeoutThresholdMs={project.timeout_threshold_ms}
                retentionManagedByPlan={Boolean(project.account_id)}
                canUpdateSettings={project.permissions.can_update_settings}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Adapter quickstart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-[1.5rem] border bg-[radial-gradient(circle_at_top_right,hsl(var(--chart-2))/0.08,transparent_28%),hsl(var(--muted))/0.22] p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RadioTower className="h-4 w-4" />
                Hosted ingest setup
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with the CrewAI adapter and send spans to the hosted ingest endpoint for this
                project.
              </p>
            </div>

            <pre className="rounded-xl border bg-muted/40 p-4 text-xs font-mono">
{`import rifft
import rifft.adapters.crewai

rifft.init(
  project_id="${project.id}",
  endpoint="${ingestUrl}",
  api_key="${project.api_key ?? "rft_live_..."}"
)
`}
            </pre>
            {!project.api_key ? (
              <p className="text-sm text-muted-foreground">
                Ask a project owner for a hosted ingest key before wiring a new producer into this
                project.
              </p>
            ) : null}

            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Install
              </div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                pip install rifft-sdk rifft-crewai
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <details className="group rounded-3xl border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
          <div className="space-y-1">
            <div className="text-base font-medium">Billing diagnostics</div>
            <p className="text-sm text-muted-foreground">
              Open this only when you need to confirm webhook sync or subscription linkage.
            </p>
          </div>
          <Badge variant="outline" className="group-open:hidden">
            Hidden by default
          </Badge>
          <Badge variant="outline" className="hidden group-open:inline-flex">
            Expanded
          </Badge>
        </summary>
        <div className="border-t px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Cost threshold</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                ${project.cost_threshold_usd.toFixed(4)}
              </CardContent>
            </Card>
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Timeout threshold</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {project.timeout_threshold_ms}ms
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Subscription state</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {usageSummary.plan.subscription_status}
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Last sync</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {lastSyncedAt ?? "No webhook received yet"}
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Account ID</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {usageSummary.plan.account_id ?? "Unavailable"}
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Polar subscription</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {usageSummary.plan.provider_subscription_id ?? "Not linked yet"}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}