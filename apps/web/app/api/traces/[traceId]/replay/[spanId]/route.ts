import { NextResponse } from "next/server";

const replayHookUrl = process.env.RIFFT_REPLAY_HOOK_URL ?? "http://localhost:8787/rifft/replay";

export async function POST(
  request: Request,
  context: { params: Promise<{ traceId: string; spanId: string }> },
) {
  const { traceId, spanId } = await context.params;
  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;

  if (!body || !body.payload || typeof body.payload !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const response = await fetch(replayHookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        trace_id: traceId,
        span_id: spanId,
        payload: body.payload,
      }),
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    if (contentType.includes("application/json")) {
      const replayResult = safeParseJson(text) as { status?: string } | null;

      if (replayResult?.status === "passed" || replayResult?.status === "failed") {
        return NextResponse.json(replayResult);
      }
    }

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "replay_hook_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Could not reach the configured replay hook.",
      },
      { status: 502 },
    );
  }
}

const safeParseJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};
