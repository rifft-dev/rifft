import { cookies } from "next/headers";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

const getAccessToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(accessTokenCookieName)?.value ?? "";
};

const toResponse = async (response: Response) => {
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/members`, {
    method: "GET",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store",
  });

  return toResponse(response);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/members`, {
    method: "POST",
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });

  return toResponse(response);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/members`, {
    method: "DELETE",
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });

  return toResponse(response);
}
