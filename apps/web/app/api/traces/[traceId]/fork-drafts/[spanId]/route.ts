import { cookies } from "next/headers";

const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function PUT(
  request: Request,
  context: { params: Promise<{ traceId: string; spanId: string }> },
) {
  const { traceId, spanId } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("rifft_access_token")?.value ?? "";
  const body = await request.text();
  const response = await fetch(`${apiBaseUrl}/traces/${traceId}/fork-drafts/${spanId}`, {
    method: "PUT",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}