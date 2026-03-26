const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const body = await request.text();
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
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

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const action = new URL(request.url).searchParams.get("action");
  const path =
    action === "regenerate-api-key"
      ? `${apiBaseUrl}/projects/${projectId}/regenerate-api-key`
      : `${apiBaseUrl}/projects/${projectId}`;
  const headers =
    action === "regenerate-api-key"
      ? undefined
      : {
          "content-type": request.headers.get("content-type") ?? "application/json",
        };

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: action === "regenerate-api-key" ? null : await request.text(),
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    method: "DELETE",
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
