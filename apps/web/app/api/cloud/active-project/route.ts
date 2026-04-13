import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { activeProjectCookieName } from "@/lib/project-cookie";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string };
  if (!body.projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookieName)?.value ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectsResponse = await fetch(`${apiBaseUrl}/cloud/projects`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!projectsResponse.ok) {
    return NextResponse.json({ error: "cloud_context_unavailable" }, { status: 500 });
  }

  const projectsBody = (await projectsResponse.json()) as {
    projects?: Array<{ id: string }>;
  };
  const hasAccess = projectsBody.projects?.some((project) => project.id === body.projectId) ?? false;
  if (!hasAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(activeProjectCookieName, body.projectId, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
