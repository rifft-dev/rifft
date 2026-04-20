const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ApiHealthResponse = {
  status: "ok" | "degraded";
  dependencies?: {
    clickhouseReachable?: boolean;
    postgresReachable?: boolean;
  };
};

export async function GET() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${apiBaseUrl}/health`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      return Response.json({ status: "degraded", degraded: true, reason: "api_error" });
    }

    const data = (await res.json()) as ApiHealthResponse;
    const degraded = data.status === "degraded";

    return Response.json({
      status: data.status,
      degraded,
      dependencies: data.dependencies ?? {},
    });
  } catch {
    // If the API itself is unreachable, report degraded
    return Response.json({ status: "degraded", degraded: true, reason: "api_unreachable" });
  }
}
