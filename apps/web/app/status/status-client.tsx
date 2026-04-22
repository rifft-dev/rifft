"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HealthResponse = {
  status: "ok" | "degraded";
  degraded: boolean;
  reason?: string;
  dependencies?: {
    clickhouseConfigured?: boolean;
    clickhouseReachable?: boolean;
    postgresConfigured?: boolean;
    postgresReachable?: boolean;
    supabaseConfigured?: boolean;
  };
};

const formatDependencyStatus = (configured?: boolean, reachable?: boolean) => {
  if (!configured) return { label: "Not configured", variant: "outline" as const };
  return reachable
    ? { label: "Healthy", variant: "secondary" as const }
    : { label: "Unavailable", variant: "destructive" as const };
};

export function StatusClient() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as HealthResponse;
        if (!cancelled) {
          setHealth(
            response.ok
              ? data
              : { status: "degraded", degraded: true, reason: data.reason ?? "api_error" },
          );
        }
      } catch {
        if (!cancelled) {
          setHealth({ status: "degraded", degraded: true, reason: "api_unreachable" });
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
  }, []);

  const clickhouse = formatDependencyStatus(
    health?.dependencies?.clickhouseConfigured,
    health?.dependencies?.clickhouseReachable,
  );
  const postgres = formatDependencyStatus(
    health?.dependencies?.postgresConfigured,
    health?.dependencies?.postgresReachable,
  );

  return (
    <div className="space-y-6 px-6 py-10 lg:px-8">
      <section className="space-y-3">
        <Badge variant="outline">Status</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Rifft system status</h1>
        <p className="max-w-2xl text-muted-foreground">
          Check whether the current environment is healthy before assuming your trace data is delayed.
        </p>
      </section>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {loading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : health?.degraded ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            {loading ? "Checking health…" : health?.degraded ? "Degraded" : "Operational"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {loading
              ? "Rifft is checking the API and backing services now."
              : health?.degraded
                ? "One or more services are unavailable, so traces or project data may be delayed."
                : "The app and its configured backing services look healthy."}
          </p>
          {health?.reason ? <p>Reason: {health.reason}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Postgres</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={postgres.variant}>{postgres.label}</Badge>
          </CardContent>
        </Card>
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>ClickHouse</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={clickhouse.variant}>{clickhouse.label}</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
