import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; datasetId: string }> },
) {
  const { projectId, datasetId } = await params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("rifft_access_token")?.value ?? null;

  const search = request.nextUrl.searchParams.toString();
  const url = `${apiBaseUrl}/projects/${projectId}/eval-datasets/${datasetId}/ci${search ? `?${search}` : ""}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
