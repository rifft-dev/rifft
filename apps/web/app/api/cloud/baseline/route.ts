import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const [projectId, accessToken] = await Promise.all([
    resolveActiveProjectId(),
    getAccessTokenFromCookies(),
  ]);

  if (!projectId || !accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { traceId?: string } | null;
  if (!body?.traceId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/baseline`, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      trace_id: body.traceId,
    }),
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
