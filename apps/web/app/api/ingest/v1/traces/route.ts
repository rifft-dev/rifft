import { NextRequest, NextResponse } from "next/server";

/**
 * Public OTLP ingest proxy.
 *
 * Accepts OTLP/HTTP JSON traces from the SDK (or any OTLP client) and
 * forwards them to the internal ingest endpoint. This lets external callers
 * use https://rifft.dev/api/ingest as their endpoint — useful when
 * ingest.rifft.dev is not publicly resolvable (e.g. during local dev or CI).
 *
 * Auth is passed through unchanged: the SDK sends
 *   Authorization: Bearer <api_key>
 * and this route forwards it to the collector as-is.
 */
export async function POST(req: NextRequest) {
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "https://ingest.rifft.dev";

  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "missing_authorization" }, { status: 401 });
  }

  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "application/json";

  let upstream: Response;
  try {
    upstream = await fetch(`${ingestUrl}/v1/traces`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        authorization: auth,
      },
      body,
    });
  } catch {
    return NextResponse.json({ error: "ingest_unavailable" }, { status: 502 });
  }

  const upstreamBody = await upstream.text();
  return new NextResponse(upstreamBody, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
