import { DollarSign, Gauge, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizationSuggestion, OptimizationSuggestionsResult } from "../lib/api-types";

const iconForType = (type: OptimizationSuggestion["type"]) => {
  switch (type) {
    case "cost_dominant_agent":
      return <DollarSign className="h-4 w-4 shrink-0 text-amber-500" />;
    case "latency_bottleneck":
      return <Gauge className="h-4 w-4 shrink-0 text-blue-500" />;
    case "model_downgrade":
      return <Cpu className="h-4 w-4 shrink-0 text-violet-500" />;
  }
};

const labelForType = (type: OptimizationSuggestion["type"]) => {
  switch (type) {
    case "cost_dominant_agent":
      return "Cost";
    case "latency_bottleneck":
      return "Latency";
    case "model_downgrade":
      return "Model";
  }
};

function SuggestionRow({ suggestion }: { suggestion: OptimizationSuggestion }) {
  return (
    <div className="space-y-2 rounded-2xl border bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {iconForType(suggestion.type)}
          <span className="text-sm font-medium">{suggestion.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {labelForType(suggestion.type)}
          </Badge>
          {suggestion.severity === "high" ? (
            <Badge variant="destructive" className="text-xs">
              High impact
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Medium impact
            </Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{suggestion.explanation}</p>

      {suggestion.estimated_saving ? (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span>Potential saving:</span>
          <span>{suggestion.estimated_saving}</span>
        </div>
      ) : null}
    </div>
  );
}

export function OptimizationCard({
  result,
}: {
  result: OptimizationSuggestionsResult;
}) {
  const { suggestions, traces_analyzed, days_analyzed } = result;

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Cost &amp; latency optimisation</CardTitle>
            <CardDescription>
              Rifft analyses your last {days_analyzed} days of traces and flags agents where a
              targeted change — a smaller model, a tighter prompt, or a structural tweak — could
              meaningfully reduce cost or latency.
            </CardDescription>
          </div>
          <Badge variant="default">Scale</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Based on {traces_analyzed} trace{traces_analyzed === 1 ? "" : "s"} in the last{" "}
          {days_analyzed} days.
        </p>

        {suggestions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {traces_analyzed < 3
              ? "Not enough trace data yet. Rifft needs at least 3 traces in the last 30 days to generate suggestions."
              : "No significant cost or latency patterns detected. Your agents look well-balanced across the traces analysed."}
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
