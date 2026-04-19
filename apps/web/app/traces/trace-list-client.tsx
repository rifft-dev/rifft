"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandInput } from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getCloudTraces } from "../lib/client-api";
import { formatCurrency, formatDuration, getTraceDisplayName, getTraceToneLabels } from "@/lib/utils";
import type { TraceSummary } from "../lib/api-types";

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

const statusVariant = (status: TraceSummary["status"]) =>
  status === "error" ? "destructive" : "secondary";

const getPriorityScore = (trace: TraceSummary) => {
  const fatalFailures = trace.mast_failures.filter((failure) => failure.severity === "fatal").length;
  const base = trace.status === "error" ? 100 : 10;
  return base + fatalFailures * 10 + trace.mast_failures.length * 4 + trace.agent_count;
};

const TRACE_TONE_CARD: Record<"critical" | "warning" | "healthy", string> = {
  critical: "border-destructive/30 bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.12,transparent_30%),hsl(var(--card))] hover:bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.16,transparent_34%),hsl(var(--card))]",
  warning: "border-amber-500/30 bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-4))/0.12,transparent_30%),hsl(var(--card))] hover:bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-4))/0.16,transparent_34%),hsl(var(--card))]",
  healthy: "border-emerald-500/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-2))/0.12,transparent_30%),hsl(var(--card))] hover:bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-2))/0.16,transparent_34%),hsl(var(--card))]",
};

const TRACE_TONE_SIGNAL: Record<"critical" | "warning" | "healthy", string> = {
  critical: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  healthy: "text-emerald-700 dark:text-emerald-300",
};

const getTraceTone = (trace: TraceSummary) => {
  const fatalFailures = trace.mast_failures.filter((f) => f.severity === "fatal").length;
  const tier: "critical" | "warning" | "healthy" =
    trace.status === "error" || fatalFailures > 0
      ? "critical"
      : trace.mast_failures.length > 0
        ? "warning"
        : "healthy";
  const { label, labelClass } = getTraceToneLabels(trace);
  return { card: TRACE_TONE_CARD[tier], label, labelClass, signalClass: TRACE_TONE_SIGNAL[tier] };
};

export function TraceListClient({
  traces: initialTraces,
  total,
  initialMode,
}: {
  traces: TraceSummary[];
  total: number;
  initialMode?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [traces, setTraces] = useState(initialTraces);
  const [loadedPage, setLoadedPage] = useState(1);
  const [query, setQuery] = useState(initialMode ?? "");
  const [status, setStatus] = useState("all");
  const [framework, setFramework] = useState("all");
  const frameworks = useMemo(
    () => [...new Set(traces.flatMap((trace) => trace.framework))].sort((left, right) => left.localeCompare(right)),
    [traces],
  );

  const filtered = useMemo(
    () =>
      [...traces]
        .filter((trace) => {
          const matchesQuery =
            query.length === 0 ||
            trace.trace_id.toLowerCase().includes(query.toLowerCase()) ||
            trace.framework.some((item) => item.toLowerCase().includes(query.toLowerCase())) ||
            trace.mast_failures.some((failure) =>
              failure.mode.toLowerCase().includes(query.toLowerCase()),
            );
          const matchesStatus = status === "all" || trace.status === status;
          const matchesFramework = framework === "all" || trace.framework.includes(framework);
          return matchesQuery && matchesStatus && matchesFramework;
        })
        .sort((left, right) => getPriorityScore(right) - getPriorityScore(left)),
    [framework, query, status, traces],
  );
  const canLoadMore = traces.length < total;

  const firstIncident = filtered.find((trace) => trace.status === "error" || trace.mast_failures.length > 0) ?? filtered[0] ?? null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <Card className="section-fade overflow-hidden rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.12,transparent_24%),radial-gradient(circle_at_bottom_right,hsl(var(--chart-1))/0.12,transparent_28%),hsl(var(--card))] shadow-sm">
        <CardHeader className="gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl">Incident queue</CardTitle>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Prioritised by failure severity and likely debugging value, not just recency.
              </p>
            </div>
            <Badge variant="outline">{filtered.length} visible traces</Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <Command className="rounded-xl border border-input bg-background/80">
              <CommandInput
                placeholder="Search trace IDs, frameworks, or failure modes..."
                value={query}
                onValueChange={setQuery}
              />
            </Command>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="unset">Unset</SelectItem>
              </SelectContent>
            </Select>
            <Select value={framework} onValueChange={setFramework}>
              <SelectTrigger>
                <SelectValue placeholder="Framework" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All frameworks</SelectItem>
                {frameworks.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {initialMode && query === initialMode ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-chart-1/25 bg-chart-1/5 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Showing traces with failure mode{" "}
                <span className="font-medium text-foreground">
                  {initialMode.replaceAll("_", " ")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
              >
                Clear filter
              </button>
            </div>
          ) : null}

          {firstIncident ? (
            <div className="grid gap-3 rounded-2xl border border-destructive/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.1,transparent_28%),hsl(var(--background))/0.84] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Open this one first
                </div>
                <div className="font-mono text-sm">{getTraceDisplayName(firstIncident)}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(firstIncident.status)}>{firstIncident.status}</Badge>
                  {firstIncident.mast_failures.slice(0, 2).map((failure) => (
                    <Tooltip key={`${firstIncident.trace_id}-${failure.mode}`}>
                      <TooltipTrigger asChild>
                        <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                          {failure.mode}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-sm">
                        {failure.explanation}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <Button asChild>
                <Link href={`/traces/${firstIncident.trace_id}`}>
                  Open trace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <div className="stagger-1 section-fade grid gap-4">
        {filtered.length === 0 ? (
          <Card className="surface-lift rounded-3xl shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground" />
              <div className="text-lg font-medium">No traces match the current filters</div>
              <p className="max-w-md text-sm text-muted-foreground">
                Try clearing the search or switching the framework and status filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((trace, index) => {
            const href = `/traces/${trace.trace_id}`;
            const failing = trace.status === "error" || trace.mast_failures.length > 0;
            const tone = getTraceTone(trace);

            return (
              <Card
                key={trace.trace_id}
                className={`surface-lift cursor-pointer rounded-3xl border shadow-sm transition-colors ${tone.card} ${
                  index === 0 && failing ? "ring-1 ring-destructive/20" : ""
                }`}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(href);
                  }
                }}
              >
                <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto] lg:items-center">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(trace.status)} className="capitalize">
                        {trace.status}
                      </Badge>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${tone.labelClass}`}
                      >
                        {!failing ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : null}
                        {tone.label}
                      </span>
                      <Badge variant="outline">{formatRelative(trace.started_at)}</Badge>
                    </div>
                    <div>
                      <div className="font-mono text-sm">{getTraceDisplayName(trace)}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {trace.agent_count} agents • {formatDuration(trace.duration_ms)} • {formatCurrency(trace.total_cost_usd)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trace.framework.map((item) => (
                        <Badge key={`${trace.trace_id}-${item}`} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className={`text-xs font-medium uppercase tracking-[0.12em] ${tone.signalClass}`}>
                      Failure signals
                    </div>
                    {trace.mast_failures.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {trace.mast_failures.slice(0, 3).map((failure) => (
                          <Tooltip
                            key={`${trace.trace_id}-${failure.mode}-${failure.agent_id ?? "trace"}`}
                          >
                            <TooltipTrigger asChild>
                              <Badge variant={failure.severity === "fatal" ? "destructive" : "outline"}>
                                {failure.mode}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                              {failure.explanation}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 text-sm ${tone.signalClass}`}>
                        <Sparkles className="h-4 w-4" />
                        No MAST failures detected
                      </div>
                    )}
                  </div>

                  <div className="flex justify-start lg:justify-end">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      Open trace
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      {canLoadMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const nextPage = loadedPage + 1;
                const data = await getCloudTraces({ page: nextPage, pageSize: 20 });
                setTraces((current) => [
                  ...current,
                  ...data.traces.filter(
                    (trace) => !current.some((existing) => existing.trace_id === trace.trace_id),
                  ),
                ]);
                setLoadedPage(nextPage);
              });
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more
              </>
            ) : (
              "Load more traces"
            )}
          </Button>
        </div>
      ) : null}
      </div>
    </TooltipProvider>
  );
}
