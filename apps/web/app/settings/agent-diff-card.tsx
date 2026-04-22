"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentFailureDiffResult } from "../lib/api-types";

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);

function AgentRow({ agent }: { agent: AgentFailureDiffResult }) {
  const total = agent.fatal_activations + agent.successful_activations;
  const fatalPct = Math.round((agent.fatal_activations / total) * 100);

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{agent.agent_id}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-destructive font-medium">{agent.fatal_activations} fatal</span>
          <span>·</span>
          <span className="text-emerald-500 font-medium">{agent.successful_activations} ok</span>
          <Badge variant="outline" className="text-xs">{fatalPct}% failure rate</Badge>
        </div>
      </div>

      {agent.input_tokens ? (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Peak input tokens</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
              <div className="text-[10px] text-destructive/70 uppercase tracking-[0.12em]">Fatal</div>
              <div className="font-mono text-base font-semibold text-destructive mt-0.5">
                {fmtTokens(agent.input_tokens.fatal_median)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                median · p90 {fmtTokens(agent.input_tokens.fatal_p90)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.12em]">Successful</div>
              <div className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {fmtTokens(agent.input_tokens.success_median)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                median · p90 {fmtTokens(agent.input_tokens.success_p90)}
              </div>
            </div>
          </div>
          {agent.input_tokens.divergence_ratio >= 1.5 ? (
            <p className="text-xs text-muted-foreground">
              Fatal runs arrive with{" "}
              <span className="font-medium text-foreground">
                {agent.input_tokens.divergence_ratio.toFixed(1)}×
              </span>{" "}
              more input tokens on average.
            </p>
          ) : null}
        </div>
      ) : null}

      {agent.duration_ms ? (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Duration</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
              <div className="text-[10px] text-destructive/70 uppercase tracking-[0.12em]">Fatal</div>
              <div className="font-mono text-base font-semibold text-destructive mt-0.5">
                {fmtMs(agent.duration_ms.fatal_median)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                median · p90 {fmtMs(agent.duration_ms.fatal_p90)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.12em]">Successful</div>
              <div className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {fmtMs(agent.duration_ms.success_median)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                median · p90 {fmtMs(agent.duration_ms.success_p90)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AgentDiffCard({ projectId }: { projectId: string }) {
  const [agents, setAgents] = useState<AgentFailureDiffResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setUnavailable(false);
        setLoadError(false);
        setAgents(null);
        const res = await fetch(
          `/api/projects/${projectId}/agent-failure-diff`,
          { cache: "no-store" },
        );
        if (cancelled) {
          return;
        }
        if (res.status === 403) {
          setUnavailable(true);
          return;
        }
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data = (await res.json()) as { agents?: AgentFailureDiffResult[] };
        if (cancelled) {
          return;
        }
        setAgents(data.agents ?? []);
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (unavailable) return null;

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Agent failure distribution</CardTitle>
            <CardDescription>
              For each agent with both fatal and successful runs in the last 30 days, Rifft
              compares how key attributes differ across the two populations.
            </CardDescription>
          </div>
          <Badge variant="outline">Pro+</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Comparing agent distributions…
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Rifft could not load agent failure distribution right now.
          </div>
        ) : agents && agents.length > 0 ? (
          <div className="space-y-3">
            {agents.map((a) => (
              <AgentRow key={a.agent_id} agent={a} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No agents have enough fatal and successful activations yet for a meaningful comparison.
            Rifft needs at least 3 of each to compute distributions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
