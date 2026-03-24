"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandInput } from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TraceSummary } from "../lib/api";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

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

export function TraceListClient({ traces }: { traces: TraceSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [framework, setFramework] = useState("all");

  const filtered = useMemo(
    () =>
      traces.filter((trace) => {
        const matchesQuery =
          query.length === 0 ||
          trace.trace_id.toLowerCase().includes(query.toLowerCase()) ||
          trace.framework.some((item) => item.toLowerCase().includes(query.toLowerCase()));
        const matchesStatus = status === "all" || trace.status === status;
        const matchesFramework = framework === "all" || trace.framework.includes(framework);
        return matchesQuery && matchesStatus && matchesFramework;
      }),
    [framework, query, status, traces],
  );

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl">Current project traces</CardTitle>
            <p className="text-sm text-muted-foreground">
              Search, filter, and inspect trace runs from the live collector.
            </p>
          </div>
          <Badge variant="outline">{filtered.length} visible</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <Command className="rounded-lg border border-input bg-card">
            <CommandInput
              placeholder="Search trace IDs or frameworks..."
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
              <SelectItem value="crewai">CrewAI</SelectItem>
              <SelectItem value="autogen">AutoGen</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Frameworks</TableHead>
                <TableHead>Failures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((trace) => (
                <TableRow key={trace.trace_id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell>
                    <Badge variant={statusVariant(trace.status)} className="capitalize">
                      {trace.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/traces/${trace.trace_id}`}>{trace.trace_id.slice(0, 12)}...</Link>
                  </TableCell>
                  <TableCell>{formatRelative(trace.started_at)}</TableCell>
                  <TableCell>{trace.duration_ms}ms</TableCell>
                  <TableCell>{trace.agent_count}</TableCell>
                  <TableCell>{formatCurrency(trace.total_cost_usd)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {trace.framework.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={trace.mast_failures.length > 0 ? "destructive" : "secondary"}>
                      {trace.mast_failures.length}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
