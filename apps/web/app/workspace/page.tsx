import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Flag,
  TrendingDown,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMastMeta } from "@/lib/mast";
import { getTraceDisplayName, getTraceToneCard, getTraceToneLabels } from "@/lib/utils";
import {
  getProjectBaseline,
  getProjectInsights,
  getProjectSettings,
  getTraceComparison,
  getTraces,
} from "../lib/api";
import { requireCloudProject } from "../lib/require-cloud-project";
import { resolveActiveProject } from "@/lib/cloud-context";
import { ProjectCookieRepair } from "@/components/project-cookie-repair";

const formatSpanCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatPercentage = (value: number) => `${Math.round(value * 100)}%`;
const formatTokenCount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const formatSignedValue = (value: number, unit = "") => `${value > 0 ? "+" : ""}${value}${unit}`;

const formatRelative = (value: string) => {
  const now = Date.now();
  const then = new Date(value).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) return "just now";
  if (Math.abs(diffMinutes) < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
};

export default async function WorkspacePage() {
  const resolution = await resolveActiveProject();
  await requireCloudProject("/workspace");
  const [traceData, insightSummary, baselineResponse, projectSettings] = await Promise.all([
    getTraces().catch(() => ({
      traces: [] as Awaited<ReturnType<typeof getTraces>>["traces"],
      total: 0,
      page: 1,
    })),
    getProjectInsights().catch(() => ({
      recent_trace_window: 20,
      insights: [],
    })),
    getProjectBaseline().catch(() => ({
      baseline: null,
    })),
    getProjectSettings().catch(() => ({
      id: "",
      permissions: {
        can_rotate_api_keys: false,
        can_update_settings: false,
      },
    })),
  ]);
  const traces = traceData.traces;
  const topInsights = insightSummary.insights.slice(0, 3);
  // Only surface genuinely failing traces — never fall back to a healthy run.
  const latestFailingTrace =
    traces.find((trace) => trace.status === "error" || trace.mast_failures.length > 0) ?? null;
  const recentHealthyTrace = traces.find((trace) => trace.status === "ok") ?? null;
  const nextTraceTone = latestFailingTrace ? getTraceToneLabels(latestFailingTrace) : null;
  const nextTraceToneCard = latestFailingTrace ? getTraceToneCard(latestFailingTrace) : null;
  const healthyTraceTone = recentHealthyTrace ? getTraceToneLabels(recentHealthyTrace) : null;
  const baseline = baselineResponse.baseline;
  const latestFailingComparison =
    latestFailingTrace && baseline && baseline.trace_id !== latestFailingTrace.trace_id
      ? await getTraceComparison(latestFailingTrace.trace_id)
          .then((r) => r.comparison)
          .catch(() => null)
      : null;
  const hasNoTraces = traces.length === 0;

  return (
    <div className="space-y-8 px-6 py-8 lg:px-8">
      {resolution.repaired && resolution.projectId ? (
        <ProjectCookieRepair projectId={resolution.projectId} />
      ) : null}
      {!resolution.isApiAvailable ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Rifft can't reach the server right now.</span>{" "}
          Some data may be missing or stale. Refresh the page once your connection is restored.
        </div>
      ) : null}
      {hasNoTraces ? (
        <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.12,transparent_28%),hsl(var(--card))] p-8 shadow-sm">
          <div className="max-w-3xl space-y-5">
            <Badge variant="outline">Workspace</Badge>
            <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
              Waiting for your first trace.
            </h1>
            <p className="text-lg text-muted-foreground">
              {projectSettings.permissions.can_rotate_api_keys
                ? "Your hosted project is ready, but nothing has landed yet. The fastest next step is to run one instrumented workflow and let onboarding open the first trace automatically."
                : "Your team is setting up this workspace. Traces will appear here as instrumented runs come in."}
            </p>
            {projectSettings.permissions.can_rotate_api_keys ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/onboarding">
                    Go to first-trace setup
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/settings">Copy project credentials</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Traces will appear here as your team sends instrumented runs. Your project admin can find setup instructions in{" "}
                <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
                  Settings
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      ) : null}
      <section className="section-fade overflow-hidden rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.14,transparent_28%),radial-gradient(circle_at_top_right,hsl(var(--chart-1))/0.14,transparent_30%),hsl(var(--card))] p-8 shadow-sm">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <Badge variant="outline">Incident triage</Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight lg:text-6xl">
                See which run needs you next.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Rifft is strongest when it helps you move from “something broke” to the exact
                trace, handoff, and root cause worth opening first.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/traces">
                  Open incident queue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings">Open settings</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <div
              className={`rounded-2xl border p-4 backdrop-blur ${
                nextTraceToneCard ?? "border-destructive/30 bg-background/65"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Next incident
              </div>
              {latestFailingTrace ? (
                <>
                  <div className="mt-3 font-mono text-sm">
                    {getTraceDisplayName(latestFailingTrace)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${nextTraceTone?.labelClass}`}
                    >
                      {nextTraceTone?.label}
                    </span>
                    <Badge variant="outline">{formatRelative(latestFailingTrace.started_at)}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {latestFailingTrace.mast_failures[0]?.mode ?? latestFailingTrace.status}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">No active incidents yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="stagger-1 section-fade">
        <Card className="surface-lift rounded-3xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Open first
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestFailingTrace ? (
              <>
                <div
                  className={`rounded-2xl border p-4 ${nextTraceToneCard ?? "border-destructive/20 bg-destructive/5"}`}
                >
                  <div className="font-mono text-sm">{getTraceDisplayName(latestFailingTrace)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="destructive">{latestFailingTrace.status}</Badge>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${nextTraceTone?.labelClass}`}
                    >
                      {nextTraceTone?.label}
                    </span>
                    <Badge variant="outline">{latestFailingTrace.agent_count} agents</Badge>
                    <Badge variant="outline">{latestFailingTrace.mast_failures.length} failures</Badge>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <Link href={`/traces/${latestFailingTrace.trace_id}`}>
                    Open incident trace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No failing traces yet. Your next trace will show up here.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="stagger-1 section-fade">
        <Card className="surface-lift rounded-3xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="h-5 w-5" />
              Before / after reference
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border bg-muted/20 p-4">
              {baseline ? (
                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Current reference run
                  </div>
                  <div className="text-sm font-medium">
  {baseline.trace_id}
</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={baseline.trace_status === "error" ? "destructive" : "secondary"}>
                      {baseline.trace_status ?? "unknown"}
                    </Badge>
                    {baseline.trace_started_at ? (
                      <Badge variant="outline">{formatRelative(baseline.trace_started_at)}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Mark a healthy or representative trace as your reference run, then compare newer runs
                    against it to see whether the fix actually helped.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/traces/${baseline.trace_id}`}>Open reference run</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    No reference run selected yet. Once you mark a healthy or representative trace as your reference, Rifft will compare every new failure against it — showing you exactly which failure modes are new, which have resolved, and whether things are getting better or worse.
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={recentHealthyTrace ? `/traces/${recentHealthyTrace.trace_id}` : "/traces"}>
                      {recentHealthyTrace ? "Open a healthy trace to set as reference" : "Open traces"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-background p-4">
              {latestFailingComparison && latestFailingTrace ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        latestFailingComparison.verdict === "improved"
                          ? "secondary"
                          : latestFailingComparison.verdict === "regressed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {latestFailingComparison.verdict === "improved"
                        ? "Improved vs reference"
                        : latestFailingComparison.verdict === "regressed"
                          ? "Regressed vs reference"
                          : latestFailingComparison.verdict === "same"
                            ? "Same as reference"
                            : "Changed vs reference"}
                    </Badge>
                    <Badge variant="outline">Latest incident</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {latestFailingComparison.deltas.failure_count <= 0 ? (
                          <TrendingDown className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-destructive" />
                        )}
                        Failure delta
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatSignedValue(latestFailingComparison.deltas.failure_count)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Fatal {formatSignedValue(latestFailingComparison.deltas.fatal_failure_count)}
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-sm font-medium">New vs resolved</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {latestFailingComparison.failure_modes.new_modes.length} new modes •{" "}
                        {latestFailingComparison.failure_modes.resolved_modes.length} resolved
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {latestFailingComparison.failure_modes.new_modes.slice(0, 2).map((mode) => (
                          <Badge key={mode} variant="destructive">
                            {mode}
                          </Badge>
                        ))}
                        {latestFailingComparison.failure_modes.resolved_modes.slice(0, 1).map((mode) => (
                          <Badge key={mode} variant="secondary">
                            Resolved: {mode}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-sm font-medium">Root cause shift</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {latestFailingComparison.root_cause.baseline ?? "Not inferred"} →{" "}
                        <span className="font-medium text-foreground">
                          {latestFailingComparison.root_cause.current ?? "Not inferred"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {latestFailingComparison.status_transition.baseline} →{" "}
                        {latestFailingComparison.status_transition.current}
                      </div>
                    </div>
                  </div>
                  <Button asChild className="w-full md:w-auto">
                    <Link href={`/traces/${latestFailingTrace.trace_id}`}>
                      Open compared incident
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {!baseline
                      ? "Choose a reference run first, then Rifft will compare newer incidents against it here."
                      : !latestFailingTrace
                        ? "You have a reference run, but there is no newer incident to compare against it yet."
                        : baseline.trace_id === latestFailingTrace.trace_id
                          ? "Your latest incident is also the reference run. Mark a healthier run as the reference or wait for a newer incident to compare."
                          : "Rifft has a reference run and a recent incident, but comparison data isn't available for this pair yet."}
                  </div>
                  <Button asChild variant="outline">
                    <Link href={baseline ? "/traces" : recentHealthyTrace ? `/traces/${recentHealthyTrace.trace_id}` : "/traces"}>
                      {baseline ? "Go to incident queue" : recentHealthyTrace ? "Open healthy trace" : "Go to traces"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="stagger-2 section-fade space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline">What should I fix first?</Badge>
            <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
              Recurring failure patterns across recent traces
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Rifft classifies failures using the{" "}
              <span className="font-medium text-foreground">UC Berkeley MAST taxonomy</span>
              {" "}— 14 failure modes covering everything from context window overflow to dropped
              agent handoffs — then groups the ones that keep repeating so you can fix the root
              cause once instead of chasing the same symptom across every trace.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Looking across the last {insightSummary.recent_trace_window} trace
            {insightSummary.recent_trace_window === 1 ? "" : "s"}
          </div>
        </div>

        {topInsights.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {topInsights.map((insight, index) => {
              const meta = getMastMeta(insight.mode);
              const tokenPressure = insight.token_pressure;
              const nearLimitRatio = tokenPressure?.near_limit_ratio ?? null;
              const hasTokenPressure =
                tokenPressure?.median_input_tokens !== null &&
                tokenPressure?.median_context_limit !== null;

              return (
                <Card
                  key={insight.mode}
                  className={`surface-lift rounded-3xl shadow-sm ${
                    index === 0
                      ? "border-destructive/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.12,transparent_34%),hsl(var(--card))]"
                      : ""
                  }`}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {index === 0 ? <Badge variant="destructive">Fix this first</Badge> : null}
                      <Badge variant={insight.severity === "fatal" ? "destructive" : "outline"}>
                        {insight.severity === "fatal" ? "Fatal pattern" : "Recurring pattern"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-xl">{meta.label}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Seen in {insight.affected_trace_count} of the last{" "}
                        {insight.recent_trace_window} traces ({formatPercentage(insight.share_of_recent_traces)}).
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Why this keeps showing up
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {insight.dominant_agent_id
                          ? `${meta.explanation} The pattern clusters most often around ${insight.dominant_agent_id}.`
                          : meta.explanation}
                      </p>
                    </div>

                    {hasTokenPressure ? (
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm">
                        <div className="font-medium text-amber-700 dark:text-amber-300">
                          Token pressure is a likely contributor
                        </div>
                        <p className="mt-2 text-muted-foreground">
                          When this failure appears, the median input is about{" "}
                          {formatTokenCount(tokenPressure?.median_input_tokens ?? 0)} tokens against a
                          median context limit of{" "}
                          {formatTokenCount(tokenPressure?.median_context_limit ?? 0)}.
                          {nearLimitRatio !== null
                            ? ` ${formatPercentage(nearLimitRatio)} of the sampled runs were already within 15% of their context window.`
                            : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          Most common trigger
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {insight.sample_explanation}
                        </p>
                      </div>
                    )}

                    <div className="rounded-2xl border bg-background p-4">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Recommended next fix
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{meta.recommendedFix}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div>
                        {insight.occurrence_count} total signal{insight.occurrence_count === 1 ? "" : "s"}
                        {insight.dominant_agent_id && insight.dominant_agent_share !== null
                          ? ` • ${formatPercentage(insight.dominant_agent_share)} on ${insight.dominant_agent_id}`
                          : ""}
                      </div>
                      {insight.latest_started_at ? <div>Latest {formatRelative(insight.latest_started_at)}</div> : null}
                    </div>

                    {insight.latest_trace_id ? (
                      <div className="flex gap-2">
                        <Button asChild className="flex-1 justify-between">
                          <Link href={`/traces/${insight.latest_trace_id}`}>
                            Open latest example
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline">
                          <Link href={`/traces?mode=${encodeURIComponent(insight.mode)}`}>
                            Show all
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <Button asChild variant="outline" className="w-full justify-between">
                        <Link href={`/traces?mode=${encodeURIComponent(insight.mode)}`}>
                          Show all traces with this pattern
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="surface-lift rounded-3xl shadow-sm">
            <CardContent className="flex flex-col gap-3 p-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
              <div>
                Once your project has a few traces with MAST signals, Rifft will start grouping the
                patterns that repeat across runs and call out the one worth fixing first.
              </div>
              <Button asChild variant="outline">
                <Link href="/onboarding">Send another trace</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="stagger-2 section-fade">
        <Card className="surface-lift rounded-3xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Workflow className="h-5 w-5" />
              Recent trace activity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {traces.slice(0, 5).map((trace) => (
              <Link
                key={trace.trace_id}
                href={`/traces/${trace.trace_id}`}
                className={`surface-lift flex flex-col gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/30 lg:flex-row lg:items-center lg:justify-between ${getTraceToneCard(trace)}`}
              >
                <div className="space-y-2">
                  <div className="text-sm font-medium">
  {getTraceDisplayName(trace)}
</div>
{trace.root_span_name ? (
  <div className="font-mono text-xs text-muted-foreground">{trace.trace_id.slice(0, 8)}…</div>
) : null}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={trace.status === "error" ? "destructive" : "secondary"}>
                      {trace.status}
                    </Badge>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${getTraceToneLabels(trace).labelClass}`}
                    >
                      {getTraceToneLabels(trace).label}
                    </span>
                    {trace.mast_failures.slice(0, 2).map((failure) => (
                      <Badge
                        key={`${trace.trace_id}-${failure.mode}`}
                        variant={failure.severity === "fatal" ? "destructive" : "outline"}
                      >
                        {failure.mode}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {trace.agent_count} agents • {formatRelative(trace.started_at)}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
