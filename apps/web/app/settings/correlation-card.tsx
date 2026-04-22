"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AttributeCorrelationFinding = {
  attribute: "max_input_tokens" | "total_cost_usd" | "total_duration_ms";
  label: string;
  threshold: number;
  unit: string;
  failure_rate_above: number;
  failure_rate_below: number;
  fatal_traces_above: number;
  total_traces_above: number;
  fatal_traces_total: number;
  total_traces: number;
};

const formatThreshold = (finding: AttributeCorrelationFinding): string => {
  if (finding.attribute === "total_cost_usd") {
    return `$${finding.threshold.toFixed(4)}`;
  }
  if (finding.attribute === "total_duration_ms") {
    return finding.threshold >= 1000
      ? `${(finding.threshold / 1000).toFixed(1)}s`
      : `${Math.round(finding.threshold)}ms`;
  }
  return new Intl.NumberFormat("en-US").format(Math.round(finding.threshold));
};

const pct = (r: number) => `${Math.round(r * 100)}%`;

function FindingRow({ finding }: { finding: AttributeCorrelationFinding }) {
  const gap = finding.failure_rate_above - finding.failure_rate_below;
  const severity = gap >= 0.35 ? "critical" : gap >= 0.2 ? "high" : "medium";
  const threshold = formatThreshold(finding);

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-sm font-medium">{finding.label}</span>
        </div>
        <Badge
          variant={severity === "critical" ? "destructive" : "outline"}
          className="text-xs"
        >
          {severity === "critical" ? "Strong signal" : severity === "high" ? "Clear signal" : "Moderate signal"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Traces where <span className="font-medium text-foreground">{finding.label.toLowerCase()}</span> exceeds{" "}
        <span className="font-mono font-medium text-foreground">{threshold}</span> fail fatally{" "}
        <span className="font-medium text-destructive">{pct(finding.failure_rate_above)}</span> of the time
        vs <span className="font-medium text-foreground">{pct(finding.failure_rate_below)}</span> below that threshold.{" "}
        {finding.fatal_traces_above} of your {finding.fatal_traces_total} fatal trace
        {finding.fatal_traces_total === 1 ? "" : "s"} this period{" "}
        {finding.fatal_traces_above === 1 ? "was" : "were"} above this threshold.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Above {threshold}</span>
            <span className="font-medium text-destructive">{pct(finding.failure_rate_above)} fatal</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destructive/70"
              style={{ width: `${Math.min(finding.failure_rate_above * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Below {threshold}</span>
            <span className="font-medium">{pct(finding.failure_rate_below)} fatal</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/50"
              style={{ width: `${Math.min(finding.failure_rate_below * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CorrelationCard({ projectId }: { projectId: string }) {
  const [findings, setFindings] = useState<AttributeCorrelationFinding[] | null>(null);
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
        setFindings(null);
        const res = await fetch(
          `/api/projects/${projectId}/attribute-correlations`,
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
        const data = (await res.json()) as { findings?: AttributeCorrelationFinding[] };
        if (cancelled) {
          return;
        }
        setFindings(data.findings ?? []);
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
            <CardTitle>Failure pattern analysis</CardTitle>
            <CardDescription>
              Rifft compares attribute distributions across fatal and successful traces to surface
              which thresholds predict failure in your pipelines.
            </CardDescription>
          </div>
          <Badge variant="outline">Pro+</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Analysing trace patterns…
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Rifft could not load failure pattern analysis right now.
          </div>
        ) : findings && findings.length > 0 ? (
          <div className="space-y-3">
            {findings.map((f) => (
              <FindingRow key={f.attribute} finding={f} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No strong attribute correlations detected yet. Rifft needs at least 10 traces with some
            fatal failures to compute reliable thresholds.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
