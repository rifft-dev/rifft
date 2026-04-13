import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProject } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ProjectResponse = {
  id: string;
  name: string;
};

type UsageResponse = {
  plan: {
    name: string;
    key: "free" | "pro";
    retention_days: number;
  };
  usage: {
    used_spans: number;
    included_spans: number;
  };
};

type TraceListResponse = {
  traces: Array<{
    trace_id: string;
    status: "ok" | "error" | "unset";
    mast_failures: Array<{ severity: "benign" | "fatal" }>;
    started_at: string;
  }>;
  total: number;
};

export async function GET() {
  const [resolution, accessToken] = await Promise.all([
    resolveActiveProject(),
    getAccessTokenFromCookies(),
  ]);

  if (!accessToken || !resolution.projectId) {
    return NextResponse.json({
      project: null,
      usage: null,
      traces: {
        total: 0,
        latest: null,
        latestIncident: null,
      },
    });
  }

  const headers = {
    authorization: `Bearer ${accessToken}`,
  };

  const [projectResponse, usageResponse, tracesResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/projects/${resolution.projectId}`, {
      cache: "no-store",
      headers,
    }),
    fetch(`${apiBaseUrl}/projects/${resolution.projectId}/usage`, {
      cache: "no-store",
      headers,
    }),
    fetch(`${apiBaseUrl}/projects/${resolution.projectId}/traces?page=1&page_size=5`, {
      cache: "no-store",
      headers,
    }),
  ]);

  if (!projectResponse.ok || !usageResponse.ok || !tracesResponse.ok) {
    return NextResponse.json({ error: "cloud_context_unavailable" }, { status: 500 });
  }

  const [project, usage, traces] = (await Promise.all([
    projectResponse.json(),
    usageResponse.json(),
    tracesResponse.json(),
  ])) as [ProjectResponse, UsageResponse, TraceListResponse];

  const latest = traces.traces[0] ?? null;
  const latestIncident =
    traces.traces.find((trace) => trace.status === "error" || trace.mast_failures.length > 0) ?? null;

  return NextResponse.json({
    project,
    usage,
    traces: {
      total: traces.total,
      latest,
      latestIncident,
    },
  });
}

