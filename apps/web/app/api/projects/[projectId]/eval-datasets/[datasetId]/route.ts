import { cookies } from "next/headers";

const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

const getToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(accessTokenCookieName)?.value ?? "";
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; datasetId: string }> },
) {
  const { projectId, datasetId } = await context.params;
  const token = await getToken();
  const response = await fetch(
    `${apiBaseUrl}/projects/${projectId}/eval-datasets/${datasetId}`,
    {
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; datasetId: string }> },
) {
  const { projectId, datasetId } = await context.params;
  const token = await getToken();
  const response = await fetch(
    `${apiBaseUrl}/projects/${projectId}/eval-datasets/${datasetId}`,
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
