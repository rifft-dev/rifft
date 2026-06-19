"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Trash2, XCircle } from "lucide-react";
import type { EvalDataset, EvalDatasetEntry } from "../../lib/api-types";
import { removeTraceFromDataset, addTraceToDataset } from "../../lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatRelative = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const statusVariant = (status: string | null) => {
  if (status === "ok") return "secondary" as const;
  if (status === "error") return "destructive" as const;
  return "outline" as const;
};

export function DatasetDetailClient({
  dataset,
  initialEntries,
}: {
  dataset: EvalDataset;
  initialEntries: EvalDatasetEntry[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [pending, start] = useTransition();

  const handleRemove = (traceId: string) => {
    start(async () => {
      try {
        await removeTraceFromDataset(dataset.project_id, dataset.id, traceId);
        setEntries((prev) => prev.filter((e) => e.trace_id !== traceId));
        router.refresh();
      } catch { /* ignore */ }
    });
  };

  const handleLabel = (traceId: string, label: "pass" | "fail") => {
    start(async () => {
      try {
        await addTraceToDataset(dataset.project_id, dataset.id, traceId, label);
        setEntries((prev) =>
          prev.map((e) => (e.trace_id === traceId ? { ...e, label } : e)),
        );
      } catch { /* ignore */ }
    });
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No traces in this dataset yet. Open any trace and use the{" "}
          <span className="font-medium text-foreground">Save to dataset</span> button.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/traces">Go to traces</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const displayName = entry.root_span_name ?? entry.trace_id;
        return (
          <Card key={entry.trace_id} className="rounded-2xl border-border/60 shadow-none">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/traces/${entry.trace_id}`}
                    className="font-medium hover:underline underline-offset-4 truncate max-w-sm"
                  >
                    {displayName}
                  </Link>
                  {entry.label === "pass" ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> pass
                    </Badge>
                  ) : entry.label === "fail" ? (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> fail
                    </Badge>
                  ) : (
                    <Badge variant="outline">unlabelled</Badge>
                  )}
                  {entry.status ? (
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.agent_count ? `${entry.agent_count} agents` : null}
                  {entry.duration_ms ? ` • ${entry.duration_ms}ms` : null}
                  {entry.started_at ? ` • ${formatRelative(entry.started_at)}` : null}
                  {entry.note ? ` • "${entry.note}"` : null}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={pending}>
                      Label
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleLabel(entry.trace_id, "pass")}
                      className="gap-2"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      Mark as pass
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleLabel(entry.trace_id, "fail")}
                      className="gap-2"
                    >
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                      Mark as fail
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                  <Link href={`/traces/${entry.trace_id}`} target="_blank" aria-label="Open trace">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(entry.trace_id)}
                  disabled={pending}
                  aria-label="Remove from dataset"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
