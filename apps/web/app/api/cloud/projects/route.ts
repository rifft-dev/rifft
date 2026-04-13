import { NextResponse } from "next/server";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(request: Request) {
  const response = await fetch(`${apiBaseUrl}/cloud/projects`, {
    method: "GET",
    headers: {
      authorization: request.headers.get("authorization") ?? "",
    },
    cache: "no-store",
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
