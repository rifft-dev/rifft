import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type TraceDetailResponse = {
  trace_id: string;
  started_at: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  mast_failures: Array<{
    mode: string;
    severity: "benign" | "fatal";
    agent_id: string | null;
    explanation: string;
  }>;
  causal_attribution: {
    root_cause_agent_id: string | null;
    failing_agent_id: string | null;
  };
};

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get("traceId");
  const accessToken = await getAccessTokenFromCookies();

  if (!traceId || !accessToken) {
    return NextResponse.json({ error: "missing_trace_context" }, { status: 400 });
  }

  const response = await fetch(`${apiBaseUrl}/traces/${traceId}`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "trace_unavailable" }, { status: response.status });
  }

  const trace = (await response.json()) as TraceDetailResponse;
  const primaryFailure = trace.mast_failures[0] ?? null;

  return NextResponse.json({
    trace_id: trace.trace_id,
    started_at: trace.started_at,
    duration_ms: trace.duration_ms,
    status: trace.status,
    primary_failure: primaryFailure,
    root_cause_agent_id: trace.causal_attribution.root_cause_agent_id,
    failing_agent_id: trace.causal_attribution.failing_agent_id,
  });
}
