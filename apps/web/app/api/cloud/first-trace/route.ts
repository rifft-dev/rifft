import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const [projectId, accessToken] = await Promise.all([
    resolveActiveProjectId(),
    getAccessTokenFromCookies(),
  ]);
  const since = requestUrl.searchParams.get("since");

  if (!projectId) {
    return NextResponse.json({ error: "missing_active_project" }, { status: 400 });
  }

  const traceQuery = new URLSearchParams({
    page: "1",
    page_size: "1",
  });
  if (since) {
    traceQuery.set("from", since);
  }

  const response = await fetch(
    `${apiBaseUrl}/projects/${projectId}/traces?${traceQuery.toString()}`,
    {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      cache: "no-store",
    },
  );

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
