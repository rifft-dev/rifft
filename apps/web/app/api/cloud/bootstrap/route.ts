import { NextResponse } from "next/server";
import { activeProjectCookieName } from "@/lib/project-cookie";

const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/cloud/bootstrap`, {
      method: "POST",
      headers: {
        authorization: request.headers.get("authorization") ?? "",
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: await request.text(),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "cloud_api_unreachable" }, { status: 503 });
  }

  const body = await response.text();
  const nextResponse = new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });

  if (response.ok) {
    try {
      const parsed = JSON.parse(body) as {
        project?: { id?: string };
        active_project_id?: string;
      };
      const activeProjectId = parsed.active_project_id ?? parsed.project?.id;
      if (activeProjectId) {
        nextResponse.cookies.set(activeProjectCookieName, activeProjectId, {
          httpOnly: false,
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
          sameSite: "lax",
        });
      }
    } catch {
      return NextResponse.json({ error: "invalid_bootstrap_response" }, { status: 502 });
    }
  }

  return nextResponse;
}
