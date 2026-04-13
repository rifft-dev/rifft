"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Copy, Crown, LoaderCircle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  project: {
    id: string;
    name: string;
    api_key: string | null;
    permissions: {
      can_manage_billing: boolean;
      can_rotate_api_keys: boolean;
    };
  };
  ingestUrl: string;
  onboardingStartedAt: string;
  preferredPlan: "pro" | null;
};

type FirstTraceResponse = {
  traces: Array<{
    trace_id: string;
  }>;
  total: number;
  page: number;
};

type FirstTraceError = "unauthorized" | "forbidden" | "missing_active_project" | "network_error" | null;

const maskApiKey = (value: string) => `${value.slice(0, 10)}...${value.slice(-6)}`;

export function FirstTraceOnboarding({
  project,
  ingestUrl,
  onboardingStartedAt,
  preferredPlan,
}: Props) {
  const router = useRouter();
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [status, setStatus] = useState("Waiting for your first trace…");
  const [pollingStartedAt] = useState(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(1);
  const [firstTraceId, setFirstTraceId] = useState<string | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [pollingError, setPollingError] = useState<FirstTraceError>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const installSnippet = useMemo(
    () => `pip install rifft-sdk rifft-crewai

import rifft
import rifft.adapters.crewai

rifft.init(
  project_id="${project.id}",
  endpoint="${ingestUrl}",
  api_key="${project.api_key ?? "rft_live_..."}"
)`,
    [ingestUrl, project.api_key, project.id],
  );

  useEffect(() => {
    if (firstTraceId) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/cloud/first-trace?since=${encodeURIComponent(onboardingStartedAt)}`,
          { cache: "no-store" },
        );
        if (!cancelled) {
          setLastCheckedAt(new Date());
        }

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (cancelled) {
            return;
          }

          const nextError =
            body.error === "forbidden" || body.error === "missing_active_project"
              ? (body.error as FirstTraceError)
              : response.status === 401
                ? "unauthorized"
                : "network_error";
          setPollingError(nextError);
          setStatus(
            nextError === "missing_active_project"
              ? "We lost your active project while waiting for the first trace."
              : nextError === "forbidden"
                ? "You no longer have access to this project."
                : nextError === "unauthorized"
                  ? "Your session expired while waiting for the first trace."
                  : "Rifft could not check for new traces right now.",
          );
          return;
        }

        const data = (await response.json()) as FirstTraceResponse;
        const trace = data.traces[0];
        if (!trace || cancelled) {
          return;
        }

        setPollingError(null);
        setFirstTraceId(trace.trace_id);
        setStatus(
          preferredPlan === "pro"
            ? "First trace received. Your Pro upgrade path is ready."
            : "First trace received. Opening it now…",
        );
        toast.success("First trace received");
        if (preferredPlan !== "pro") {
          router.push(`/traces/${trace.trace_id}`);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setLastCheckedAt(new Date());
        setPollingError("network_error");
        setStatus("Rifft could not check for new traces right now.");
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [firstTraceId, onboardingStartedAt, preferredPlan, router]);

  const showProSuccessState = preferredPlan === "pro" && Boolean(firstTraceId);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - pollingStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [pollingStartedAt]);

  useEffect(() => {
    if (firstTraceId || pollingError || elapsedSeconds < 60) {
      return;
    }

    setStatus("Still waiting. Check the project ID, endpoint, and API key in your SDK setup.");
  }, [elapsedSeconds, firstTraceId, pollingError]);

  return (
    <div className="space-y-8 px-6 py-8 lg:px-8">
      <section className="rounded-[2rem] border bg-card p-8 shadow-sm">
        <div className="max-w-4xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <Wand2 className="h-3.5 w-3.5" />
            First-trace onboarding
          </div>
          {preferredPlan === "pro" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <Crown className="h-3.5 w-3.5" />
              You&apos;re on the Pro path
            </div>
          ) : null}
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-5xl">
            Your project is ready.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Copy the hosted credentials below, run your first instrumented agent call, and Rifft
            will open the first trace detail automatically as soon as it lands.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Failures automatically classified using the UC Berkeley MAST taxonomy
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              Fork and replay any handoff point without restarting your agents
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">Project credentials</CardTitle>
            <p className="text-sm text-muted-foreground">
              This is the shortest path from hosted sign-in to the graph view.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="text-sm font-medium">Project</div>
                <div className="mt-1 text-sm text-muted-foreground">{project.name}</div>
                <div className="mt-3 font-mono text-xs">{project.id}</div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="text-sm font-medium">Hosted ingest</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{ingestUrl}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">API key</div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={project.api_key ? maskApiKey(project.api_key) : "Owner access required"}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!project.api_key}
                  onClick={async () => {
                    if (!project.api_key) {
                      return;
                    }
                    await navigator.clipboard.writeText(project.api_key);
                    setHasCopiedKey(true);
                    toast.success("API key copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Install and send your first trace</div>
              <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-xs leading-6">
                <code>{installSnippet}</code>
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(installSnippet);
                    toast.success("Setup snippet copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy snippet
                </Button>
                {hasCopiedKey ? (
                  <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    API key copied
                  </span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">
              {showProSuccessState ? "Your first trace is live" : "Waiting for first trace"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {showProSuccessState
                ? "You hit the first-trace moment. This is the best time to move into the Pro checkout."
                : "Rifft is already listening for spans on your hosted project."}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border bg-muted/20 p-5">
              <div className="flex items-center gap-3 text-sm">
                {showProSuccessState ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )}
                <span>{status}</span>
              </div>
              {showProSuccessState ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border bg-background/80 p-4">
                    <div className="text-sm font-medium">Upgrade when the value is fresh</div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pro gives you 90-day retention, 500K spans per month, unlimited team members, and a
                      much smoother path once this project becomes part of your regular workflow.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={isStartingCheckout || !project.permissions.can_manage_billing}
                      onClick={async () => {
                        try {
                          setIsStartingCheckout(true);
                          const response = await fetch("/api/cloud/pro-checkout", {
                            method: "POST",
                          });
                          const data = (await response.json()) as { url?: string; error?: string };

                          if (!response.ok || !data.url) {
                            throw new Error(
                              data.error === "forbidden"
                                ? "Only the billing owner can start the Pro upgrade."
                                : (data.error ?? "Could not create Polar checkout"),
                            );
                          }

                          window.location.href = data.url;
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Could not create Polar checkout",
                          );
                          setIsStartingCheckout(false);
                        }
                      }}
                    >
                      <Crown className="h-4 w-4" />
                      {isStartingCheckout ? "Opening checkout..." : "Upgrade to Pro"}
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/traces/${firstTraceId}`)}>
                      Open first trace
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    <span>
                      Listening for spans
                      {lastCheckedAt
                        ? ` · last checked ${lastCheckedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                        : " · checking now…"}
                    </span>
                    <span className="ml-auto tabular-nums">{elapsedSeconds}s</span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border bg-muted/20 p-5">
              <div className="text-sm font-medium">Before you run it</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <span>Use <code>project_id="{project.id}"</code> exactly as shown.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <span>Send spans to <code>{ingestUrl}</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <span>
                    {project.api_key
                      ? "Use the hosted API key for this project, not a local or old key."
                      : "Ask a project owner to reveal or rotate the hosted API key first."}
                  </span>
                </li>
              </ul>
            </div>

            <div className="space-y-3 rounded-2xl border bg-muted/20 p-5">
              <div className="text-sm font-medium">What to check if it still looks quiet</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Your terminal should show the instrumented run actually starting.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Collector errors usually show up as <code>invalid_api_key</code>,{" "}
                    <code>span_limit_exceeded</code>, or <code>no_spans_extracted</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    If you pasted the snippet into a different repo or script, double-check that
                    the environment actually ran after initialization.
                  </span>
                </li>
              </ul>
              {elapsedSeconds >= 45 && !firstTraceId && !pollingError ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                  Still waiting after {elapsedSeconds}s. The most common cause is a mismatched
                  project ID, endpoint, or API key.
                </div>
              ) : null}
              {elapsedSeconds >= 90 && !firstTraceId && !pollingError ? (
                <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  If you want to sanity-check the product path itself, try rerunning the snippet
                  with a tiny test invocation so Rifft has one clear hosted event to receive.
                </div>
              ) : null}
              {pollingError ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                  {pollingError === "unauthorized"
                    ? "Your session expired. Sign in again and Rifft will resume listening."
                    : pollingError === "forbidden"
                      ? "This project is no longer available to your account."
                      : pollingError === "missing_active_project"
                        ? "Choose an active project again before continuing."
                        : "The app could not reach the hosted API. Refresh the page and try again."}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}