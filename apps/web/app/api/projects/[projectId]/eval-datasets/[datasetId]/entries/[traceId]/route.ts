import { cookies } from "next/headers";

const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; datasetId: string; traceId: string }> },
) {
  const { projectId, datasetId, traceId } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get(accessTokenCookieName)?.value ?? "";
  const response = await fetch(
    `${apiBaseUrl}/projects/${projectId}/eval-datasets/${datasetId}/entries/${traceId}`,
    {
      method: "DELETE",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    },
  );
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
