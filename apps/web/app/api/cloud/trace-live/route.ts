import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get("traceId");
  const accessToken = await getAccessTokenFromCookies();

  if (!traceId || !accessToken) {
    return NextResponse.json({ error: "missing_trace_context" }, { status: 400 });
  }

  const response = await fetch(`${apiBaseUrl}/traces/${traceId}/live`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
