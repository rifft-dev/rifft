import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string; agentId: string }> },
) {
  const accessToken = await getAccessTokenFromCookies();
  const { traceId, agentId } = await params;

  if (!accessToken) {
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });
  }

  const response = await fetch(
    `${apiBaseUrl}/traces/${encodeURIComponent(traceId)}/agents/${encodeURIComponent(agentId)}`,
    {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
