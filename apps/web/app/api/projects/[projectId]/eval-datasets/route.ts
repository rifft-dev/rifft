import { cookies } from "next/headers";

const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

const proxyToBackend = async (
  request: Request,
  projectId: string,
  method: string,
  body?: string | null,
) => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookieName)?.value ?? "";
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/eval-datasets`, {
    method,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined && body !== null
        ? { "content-type": request.headers.get("content-type") ?? "application/json" }
        : {}),
    },
    ...(body !== undefined && body !== null ? { body } : {}),
    cache: "no-store",
  });
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
};

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return proxyToBackend(request, projectId, "GET");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return proxyToBackend(request, projectId, "POST", await request.text());
}
