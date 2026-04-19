import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProject } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const accessToken = await getAccessTokenFromCookies();
  const context = await resolveActiveProject();

  if (!accessToken || !context.projectId) {
    return NextResponse.json({ error: "missing_project_context" }, { status: 400 });
  }

  const upstreamUrl = new URL(`${apiBaseUrl}/projects/${context.projectId}/traces`);
  const page = request.nextUrl.searchParams.get("page");
  const pageSize = request.nextUrl.searchParams.get("page_size");
  const status = request.nextUrl.searchParams.get("status");
  const framework = request.nextUrl.searchParams.get("framework");

  if (page) upstreamUrl.searchParams.set("page", page);
  if (pageSize) upstreamUrl.searchParams.set("page_size", pageSize);
  if (status) upstreamUrl.searchParams.set("status", status);
  if (framework) upstreamUrl.searchParams.set("framework", framework);

  const response = await fetch(upstreamUrl.toString(), {
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
