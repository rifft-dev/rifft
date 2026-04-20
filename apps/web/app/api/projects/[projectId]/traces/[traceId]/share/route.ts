import { cookies } from "next/headers";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; traceId: string }> },
) {
  const { projectId, traceId } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookieName)?.value ?? "";
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/traces/${traceId}/share`, {
    method: "POST",
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      "content-type": "application/json",
    },
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
