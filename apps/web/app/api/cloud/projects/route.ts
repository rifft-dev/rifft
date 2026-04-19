import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccessTokenFromCookies } from "@/lib/cloud-context";
import { activeProjectCookieName } from "@/lib/project-cookie";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const getAuthorizationHeader = async (request: Request) => {
  const requestAuthorization = request.headers.get("authorization");
  if (requestAuthorization) {
    return requestAuthorization;
  }

  const accessToken = await getAccessTokenFromCookies();
  return accessToken ? `Bearer ${accessToken}` : "";
};

export async function GET(request: Request) {
  const authorization = await getAuthorizationHeader(request);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/cloud/projects`, {
      method: "GET",
      headers: {
        authorization,
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "cloud_api_unreachable" }, { status: 503 });
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function POST(request: Request) {
  const authorization = await getAuthorizationHeader(request);
  const cookieStore = await cookies();
  const currentProjectId = cookieStore.get(activeProjectCookieName)?.value ?? null;
  const parsedBody = (await request.json().catch(() => ({}))) as { name?: string };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/cloud/projects`, {
      method: "POST",
      headers: {
        authorization,
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: JSON.stringify({
        ...parsedBody,
        ...(currentProjectId ? { current_project_id: currentProjectId } : {}),
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "cloud_api_unreachable" }, { status: 503 });
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
