"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, FlaskConical, LoaderCircle, Sparkles, Wand2 } from "lucide-react";
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
  traces: Array<{ trace_id: string }>;
  total: number;
  page: number;
};

type FirstTraceError = "unauthorized" | "forbidden" | "missing_active_project" | "network_error" | null;
type SampleTraceResponse = { traceId?: string; error?: string; message?: string };

type TabOption = "crewai" | "autogen" | "python" | "node" | "mcp";
type PackageManagerOption = "npm" | "pnpm" | "yarn";

const TABS: { id: TabOption; label: string }[] = [
  { id: "crewai",  label: "CrewAI"  },
  { id: "autogen", label: "AutoGen" },
  { id: "python",  label: "Python"  },
  { id: "node",    label: "Node.js" },
  { id: "mcp",     label: "MCP"     },
];

const buildSnippet = ({
  tab,
  packageManager,
  projectId,
  ingestUrl,
  apiKey,
}: {
  tab: TabOption;
  packageManager: PackageManagerOption;
  projectId: string;
  ingestUrl: string;
  apiKey: string | null;
}) => {
  const key = apiKey ?? "rft_live_...";

  if (tab === "crewai") {
    return `pip install rifft-sdk rifft-crewai

import rifft

rifft.init(
  project_id="${projectId}",
  endpoint="${ingestUrl}",
  api_key="${key}"
)
# CrewAI auto-instrumented — run your crew normally`;
  }

  if (tab === "autogen") {
    return `pip install rifft-sdk rifft-autogen

import rifft

rifft.init(
  project_id="${projectId}",
  endpoint="${ingestUrl}",
  api_key="${key}"
)
# AutoGen auto-instrumented — run your flow normally`;
  }

  if (tab === "python") {
    return `pip install rifft-sdk

import rifft

rifft.init(
  project_id="${projectId}",
  endpoint="${ingestUrl}",
  api_key="${key}"
)
# wrap your agent boundaries manually`;
  }

  const install =
    packageManager === "pnpm" ? "pnpm add @rifft-dev/rifft" :
    packageManager === "yarn" ? "yarn add @rifft-dev/rifft" :
    "npm install @rifft-dev/rifft";

  if (tab === "node") {
    return `${install}

import { init, withSpan } from "@rifft-dev/rifft";

init({
  project_id: "${projectId}",
  endpoint: "${ingestUrl}",
  api_key: "${key}",
});

await withSpan("agent.run", { agent_id: "orchestrator" }, async () => {
  // your agent logic here
});`;
  }

  // mcp
  const installMcp =
    packageManager === "pnpm" ? "pnpm add @rifft-dev/rifft @rifft-dev/mcp" :
    packageManager === "yarn" ? "yarn add @rifft-dev/rifft @rifft-dev/mcp" :
    "npm install @rifft-dev/rifft @rifft-dev/mcp";

  return `${installMcp}

import { init } from "@rifft-dev/rifft";
import { instrumentMcpClient } from "@rifft-dev/mcp";

init({
  project_id: "${projectId}",
  endpoint: "${ingestUrl}",
  api_key: "${key}",
});

const tracedClient = instrumentMcpClient(mcpClient, {
  agent_id: "mcp-client",
  server_name: "my-mcp-server",
});`;
};

const maskApiKey = (value: string) => `${value.slice(0, 10)}...${value.slice(-6)}`;

const readJsonResponse = async <T,>(response: Response): Promise<T | null> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return (await response.json().catch(() => null)) as T | null;
};

export function FirstTraceOnboarding({
  project,
  ingestUrl,
  onboardingStartedAt,
  preferredPlan,
}: Props) {
  const router = useRouter();
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [status, setStatus] = useState("Waiting for your first trace…");
  const [isSlowStart, setIsSlowStart] = useState(false);
  const [firstTraceId, setFirstTraceId] = useState<string | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [pollingError, setPollingError] = useState<FirstTraceError>(null);
  const [tab, setTab] = useState<TabOption>("crewai");
  const [packageManager, setPackageManager] = useState<PackageManagerOption>("npm");
  const [isSendingSample, setIsSendingSample] = useState(false);

  const isNodeTab = tab === "node" || tab === "mcp";

  const snippet = useMemo(
    () => buildSnippet({ tab, packageManager, projectId: project.id, ingestUrl, apiKey: project.api_key }),
    [tab, packageManager, project.id, ingestUrl, project.api_key],
  );

  const sendSampleTrace = async () => {
    try {
      setIsSendingSample(true);
      const response = await fetch("/api/cloud/sample-trace", {
        method: "POST",
        headers: { accept: "application/json" },
        credentials: "include",
      });
      const data = await readJsonResponse<SampleTraceResponse>(response);
      if (!response.ok || !data?.traceId) {
        throw new Error(
          data?.message ?? data?.error ??
          (response.status === 401 ? "Your session expired. Sign in again, then try the sample trace."
            : response.status === 404 ? "Sample trace endpoint not available in this deployment."
            : `Server returned ${response.status}.`)
        );
      }
      toast.success("Sample trace sent — opening it now");
      router.push(`/traces/${data.traceId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send sample trace");
      setIsSendingSample(false);
    }
  };

  useEffect(() => {
    if (firstTraceId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/cloud/first-trace?since=${encodeURIComponent(onboardingStartedAt)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (cancelled) return;
          const nextError =
            body.error === "forbidden" || body.error === "missing_active_project"
              ? (body.error as FirstTraceError)
              : response.status === 401 ? "unauthorized" : "network_error";
          setPollingError(nextError);
          setStatus(
            nextError === "missing_active_project" ? "We lost your active project while waiting."
              : nextError === "forbidden" ? "You no longer have access to this project."
              : nextError === "unauthorized" ? "Your session expired — sign in again."
              : "Rifft could not check for new traces right now.",
          );
          return;
        }

        const data = (await response.json()) as FirstTraceResponse;
        const trace = data.traces[0];
        if (!trace || cancelled) return;

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
        if (cancelled) return;
        setPollingError("network_error");
        setStatus("Rifft couldn't reach the API — your trace won't be lost. Refresh to try again.");
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [firstTraceId, onboardingStartedAt, preferredPlan, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!firstTraceId && !pollingError) setIsSlowStart(true);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [firstTraceId, pollingError]);

  const showProSuccessState = preferredPlan === "pro" && Boolean(firstTraceId);
  const canShowSnippet = Boolean(project.api_key);

  return (
    <div className="space-y-8 px-6 py-8 lg:px-8">
      {/* Header */}
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
            Copy the credentials below, run your first instrumented agent, and Rifft opens the trace automatically.
          </p>
        </div>
      </section>

      {/* Sample trace shortcut */}
      <section className="rounded-[2rem] border border-dashed bg-card/50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              Don&apos;t have an agent ready yet?
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Send a sample trace now — a 3-agent content pipeline with a real failure — to explore
              the graph view, root cause panel, and replay before connecting your own code.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={isSendingSample || !project.api_key}
            onClick={sendSampleTrace}
            className="shrink-0"
          >
            {isSendingSample ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {isSendingSample ? "Sending…" : "Try a sample trace"}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        {/* Left: credentials + snippet */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">Project credentials</CardTitle>
            <p className="text-sm text-muted-foreground">
              Copy the API key, pick your framework, then run the snippet.
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

            {/* API key */}
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
                    if (!project.api_key) return;
                    await navigator.clipboard.writeText(project.api_key);
                    setHasCopiedKey(true);
                    toast.success("API key copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {hasCopiedKey ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Framework tabs */}
            <div className="space-y-3">
              <div className="text-sm font-medium">Install and send your first trace</div>
              <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/20 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === t.id
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Package manager (Node/MCP only) */}
              {isNodeTab ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Package manager:</span>
                  {(["npm", "pnpm", "yarn"] as const).map((pm) => (
                    <Button
                      key={pm}
                      type="button"
                      variant={packageManager === pm ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPackageManager(pm)}
                    >
                      {pm}
                    </Button>
                  ))}
                </div>
              ) : null}

              {!canShowSnippet ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
                  Ask a project owner to copy this snippet — hosted API keys are only visible to owners.
                </div>
              ) : (
                <div className="space-y-2">
                  <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-xs leading-6">
                    <code>{snippet}</code>
                  </pre>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(snippet);
                      toast.success("Snippet copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy snippet
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: waiting state */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">
              {showProSuccessState ? "Your first trace is live" : "Waiting for first trace"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {showProSuccessState
                ? "You hit the first-trace moment — best time to move into Pro."
                : "Rifft is listening for spans on your hosted project."}
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
                    <div className="text-sm font-medium">Upgrade while the value is fresh</div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pro gives you 90-day retention, 500K spans/month, unlimited team members,
                      and replay from any handoff.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={isStartingCheckout || !project.permissions.can_manage_billing}
                      onClick={async () => {
                        try {
                          setIsStartingCheckout(true);
                          const response = await fetch("/api/cloud/pro-checkout", { method: "POST" });
                          const data = (await response.json()) as { url?: string; error?: string };
                          if (!response.ok || !data.url) {
                            throw new Error(
                              data.error === "forbidden"
                                ? "Only the billing owner can start the Pro upgrade."
                                : (data.error ?? "Could not create Stripe checkout"),
                            );
                          }
                          window.location.href = data.url;
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not create Stripe checkout");
                          setIsStartingCheckout(false);
                        }
                      }}
                    >
                      <Crown className="h-4 w-4" />
                      {isStartingCheckout ? "Opening checkout…" : "Upgrade to Pro"}
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/traces/${firstTraceId}`)}>
                      Open first trace
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span>Listening for spans · checking every few seconds</span>
                </div>
              )}
            </div>

            {isSlowStart && !firstTraceId && !pollingError ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                Still waiting. Most common cause: mismatched project ID, endpoint, or API key.
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
                      : "Rifft couldn't reach the API — your trace won't be lost. Refresh to try again."}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
