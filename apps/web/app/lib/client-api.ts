import type { ForkDraft, TraceBaseline, TraceSummary } from "./api-types";

type ReplayResult = {
  runId: string;
  status: "passed" | "failed";
  headline?: string;
  error?: string;
  source_trace_id?: string | null;
  source_span_id?: string | null;
};

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const fetchBrowserJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const target = path.startsWith("/api/") ? path : `${apiBaseUrl}${path}`;
  const response = await fetch(target, {
    cache: "no-store",
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const saveForkDraft = (traceId: string, spanId: string, payload: unknown) =>
  fetchBrowserJson<ForkDraft>(`/api/traces/${traceId}/fork-drafts/${spanId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

export const replayFromSpan = (traceId: string, spanId: string, payload: unknown) =>
  fetch(`/api/traces/${traceId}/replay/${spanId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ payload }),
  }).then(async (response) => {
    const body = (await response.json().catch(() => ({}))) as Partial<ReplayResult> & {
      message?: string;
    };

    if (body.runId && (body.status === "passed" || body.status === "failed")) {
      return body as ReplayResult;
    }

    if (!response.ok) {
      throw new Error(body.message ?? body.error ?? `Failed to replay from span: ${response.status}`);
    }

    throw new Error("Replay hook returned an unexpected response.");
  });

export const setProjectBaseline = (traceId: string) =>
  fetchBrowserJson<{ baseline: TraceBaseline | null }>(`/api/cloud/baseline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ traceId }),
  });

export const getCloudTraces = (options?: {
  page?: number;
  pageSize?: number;
  status?: string;
  framework?: string;
}) => {
  const searchParams = new URLSearchParams();
  if (options?.page) {
    searchParams.set("page", String(options.page));
  }
  if (options?.pageSize) {
    searchParams.set("page_size", String(options.pageSize));
  }
  if (options?.status && options.status !== "all") {
    searchParams.set("status", options.status);
  }
  if (options?.framework && options.framework !== "all") {
    searchParams.set("framework", options.framework);
  }

  const suffix = searchParams.toString().length > 0 ? `?${searchParams.toString()}` : "";
  return fetchBrowserJson<{ traces: TraceSummary[]; total: number; page: number }>(
    `/api/cloud/traces${suffix}`,
  );
};

export const createCloudWorkspace = (name: string) =>
  fetchBrowserJson<{ project: { id: string; name: string } }>(`/api/cloud/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

export const createPlanCheckout = (plan: "pro" | "scale") =>
  fetchBrowserJson<{ url: string }>(`/api/cloud/pro-checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ planKey: plan }),
  });
