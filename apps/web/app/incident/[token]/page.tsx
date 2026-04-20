import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, GitBranch, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { getMastMeta } from "@/lib/mast";
import type { TraceDetail, TraceComparison } from "../../lib/api-types";

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentSharePayload = {
  trace: TraceDetail;
  comparison: TraceComparison | null;
  shared_at: string;
};

// ─── Data fetching ────────────────────────────────────────────────────────────

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getIncidentShare(token: string): Promise<IncidentSharePayload | null> {
  const response = await fetch(`${apiBaseUrl}/incident/${token}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as IncidentSharePayload;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getIncidentShare(token);
  if (!data) return { title: "Incident not found" };

  const { trace } = data;
  const primaryFailure = trace.mast_failures[0];
  const label = primaryFailure ? getMastMeta(primaryFailure.mode).label : null;
  const title = trace.root_span_name
    ? `Incident: ${trace.root_span_name}`
    : `Incident: ${trace.trace_id}`;
  const description = label
    ? `${label} detected in trace with ${trace.agent_count} agents. Shared via Rifft.`
    : `Shared incident trace with ${trace.agent_count} agents. Shared via Rifft.`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatSignedNumber = (value: number, unit = "") =>
  `${value > 0 ? "+" : ""}${value}${unit}`;

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getIncidentShare(token);
  if (!data) notFound();

  const { trace, comparison, shared_at } = data;

  const primaryFailure = trace.mast_failures[0] ?? null;
  const primaryMeta = primaryFailure ? getMastMeta(primaryFailure.mode) : null;
  const rootCauseAgent = trace.causal_attribution.root_cause_agent_id ?? "Not inferred";
  const failingAgent = trace.causal_attribution.failing_agent_id ?? "Not inferred";
  const causalChain =
    trace.causal_attribution.causal_chain.length > 0
      ? trace.causal_attribution.causal_chain.join(" → ")
      : null;

  const hasIncidentContext = trace.mast_failures.length > 0 || trace.status === "error";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Public header ── */}
      <header className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Rifft
          </Link>
          <Badge variant="outline" className="text-xs">
            Public incident report
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {/* ── Title block ── */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={trace.status === "error" ? "destructive" : "secondary"}>
              {trace.status}
            </Badge>
            <Badge variant="outline">{trace.agent_count} agents</Badge>
            <Badge variant="outline">{formatCurrency(trace.total_cost_usd)}</Badge>
            {trace.framework.slice(0, 2).map((fw: string) => (
              <Badge key={fw} variant="outline">
                {fw}
              </Badge>
            ))}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
            {trace.root_span_name ?? trace.trace_id}
          </h1>
          {trace.root_span_name ? (
            <p className="font-mono text-xs text-muted-foreground">{trace.trace_id}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Started {formatTimestamp(trace.started_at)} · Shared {formatTimestamp(shared_at)}
          </p>
        </section>

        {/* ── Causal chain + root cause ── */}
        {hasIncidentContext ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Failure attribution</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Root cause
                </div>
                <div className="mt-2 font-mono text-sm">{rootCauseAgent}</div>
                {primaryMeta ? (
                  <div className="mt-1 text-xs text-muted-foreground">{primaryMeta.label}</div>
                ) : null}
              </div>
              <div className="rounded-2xl border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="h-4 w-4" />
                  Failing agent
                </div>
                <div className="mt-2 font-mono text-sm">{failingAgent}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Last known failing point in the inferred chain
                </div>
              </div>
            </div>
            {causalChain ? (
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-2 text-sm font-medium">Causal chain</div>
                <p className="font-mono text-sm text-muted-foreground">{causalChain}</p>
                {trace.causal_attribution.explanation ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {trace.causal_attribution.explanation}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── MAST failures ── */}
        {trace.mast_failures.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Failure classification</h2>
            <div className="space-y-3">
              {trace.mast_failures.slice(0, 6).map((failure: TraceDetail["mast_failures"][number], i: number) => {
                const meta = getMastMeta(failure.mode);
                return (
                  <div
                    key={`${failure.mode}-${i}`}
                    className="rounded-2xl border bg-card p-4 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                        {failure.severity}
                      </Badge>
                      <span className="text-sm font-medium">{meta.label}</span>
                      {failure.agent_id ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {failure.agent_id}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{failure.explanation}</p>
                    <p className="text-xs text-muted-foreground/70">
                      Suggested fix: {meta.recommendedFix}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── Comparison verdict ── */}
        {comparison ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Before / after comparison</h2>
            <div className="rounded-3xl border bg-muted/20 p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    comparison.verdict === "improved"
                      ? "secondary"
                      : comparison.verdict === "regressed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {comparison.verdict === "improved"
                    ? "Improved vs baseline"
                    : comparison.verdict === "regressed"
                      ? "Regressed vs baseline"
                      : comparison.verdict === "same"
                        ? "Same as baseline"
                        : "Changed vs baseline"}
                </Badge>
                {comparison.baseline ? (
                  <Badge variant="outline">Baseline {comparison.baseline.trace_id}</Badge>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {comparison.deltas.failure_count <= 0 ? (
                      <TrendingDown className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-destructive" />
                    )}
                    Failure delta
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {formatSignedNumber(comparison.deltas.failure_count)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Fatal {formatSignedNumber(comparison.deltas.fatal_failure_count)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Duration delta</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {formatSignedNumber(Math.round(comparison.deltas.duration_ms), "ms")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Cost {formatCurrency(comparison.deltas.cost_usd)}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Failure modes</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {comparison.failure_modes.new_modes.slice(0, 2).map((mode: string) => (
                      <Badge key={mode} variant="destructive">
                        New: {mode}
                      </Badge>
                    ))}
                    {comparison.failure_modes.resolved_modes.slice(0, 2).map((mode: string) => (
                      <Badge key={mode} variant="secondary">
                        Fixed: {mode}
                      </Badge>
                    ))}
                    {comparison.failure_modes.new_modes.length === 0 &&
                    comparison.failure_modes.resolved_modes.length === 0 ? (
                      <Badge variant="outline">No mode changes</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background p-4">
                  <div className="text-sm font-medium">Root cause shift</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {comparison.root_cause.baseline ?? "Not inferred"} →{" "}
                    <span className="font-medium text-foreground">
                      {comparison.root_cause.current ?? "Not inferred"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {comparison.status_transition.baseline} → {comparison.status_transition.current}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── CTA ── */}
        <section className="rounded-3xl border bg-muted/20 p-8 text-center space-y-4">
          <h2 className="text-xl font-semibold">Debug your own pipelines</h2>
          <p className="mx-auto max-w-md text-muted-foreground text-sm">
            Rifft automatically traces multi-agent pipelines, classifies failures, and shows you
            exactly where the causal chain broke down — so you spend less time guessing.
          </p>
          <Button asChild size="lg">
            <Link href="/">
              Try Rifft free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
        Shared via <Link href="/" className="underline underline-offset-2">Rifft</Link>
        {" · "}This is a read-only public incident report.
      </footer>
    </div>
  );
}
