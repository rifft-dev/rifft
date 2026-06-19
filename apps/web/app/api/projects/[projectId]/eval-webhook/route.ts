import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const getToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get("rifft_access_token")?.value ?? null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = await getToken();
  const res = await fetch(`${apiBaseUrl}/projects/${projectId}/eval-webhook`, {
    cache: "no-store",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = await getToken();
  const body = await request.json();
  const res = await fetch(`${apiBaseUrl}/projects/${projectId}/eval-webhook`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
