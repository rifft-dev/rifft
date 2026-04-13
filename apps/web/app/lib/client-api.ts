import type { ForkDraft, TraceBaseline } from "./api-types";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.INTERNAL_API_URL ?? "http://localhost:4000";

const fetchBrowserJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
  fetchBrowserJson<ForkDraft>(`/traces/${traceId}/fork-drafts/${spanId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });

export const setProjectBaseline = (traceId: string) =>
  fetchBrowserJson<{ baseline: TraceBaseline | null }>(`/api/cloud/baseline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ traceId }),
  });
