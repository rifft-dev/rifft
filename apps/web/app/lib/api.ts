import { cookies } from "next/headers";
import { resolveActiveProjectId } from "@/lib/cloud-context";
export type {
  AgentDetail,
  ForkDraft,
  ProjectInsightsSummary,
  TraceBaseline,
  TraceComparison,
  ProjectSettings,
  ProjectUsageSummary,
  TraceDetail,
  TraceLiveSnapshot,
  TraceGraph,
  TraceSummary,
  TraceTimeline,
} from "./api-types";
import type {
  AgentDetail,
  ForkDraft,
  ProjectInsightsSummary,
  TraceBaseline,
  TraceComparison,
  ProjectSettings,
  ProjectUsageSummary,
  TraceDetail,
  TraceLiveSnapshot,
  TraceGraph,
  TraceSummary,
  TraceTimeline,
} from "./api-types";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessTokenCookieName = "rifft_access_token";

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookieName)?.value ?? null;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const getProjectSettings = async () => {
  const projectId = await resolveActiveProjectId();
  return fetchJson<ProjectSettings>(`/projects/${projectId}`);
};

export const getProjectUsageSummary = async () => {
  const projectId = await resolveActiveProjectId();
  return fetchJson<ProjectUsageSummary>(`/projects/${projectId}/usage`);
};

export const getProjectInsights = async () => {
  const projectId = await resolveActiveProjectId();
  return fetchJson<ProjectInsightsSummary>(`/projects/${projectId}/insights`);
};

export const getProjectBaseline = async () => {
  const projectId = await resolveActiveProjectId();
  return fetchJson<{ baseline: TraceBaseline | null }>(`/projects/${projectId}/baseline`);
};

export const getTraces = async () => {
  const projectId = await resolveActiveProjectId();
  return fetchJson<{ traces: TraceSummary[]; total: number; page: number }>(
    `/projects/${projectId}/traces`,
  );
};

export const getTraceDetail = (traceId: string) => fetchJson<TraceDetail>(`/traces/${traceId}`);
export const getTraceComparison = (traceId: string) =>
  fetchJson<{ comparison: TraceComparison | null }>(`/traces/${traceId}/comparison`);
export const getTraceGraph = (traceId: string) => fetchJson<TraceGraph>(`/traces/${traceId}/graph`);
export const getTraceTimeline = (traceId: string) =>
  fetchJson<TraceTimeline>(`/traces/${traceId}/timeline`);
export const getAgentDetail = (traceId: string, agentId: string) =>
  fetchJson<AgentDetail>(`/traces/${traceId}/agents/${agentId}`);
export const getForkDrafts = async (traceId: string) =>
  fetchJson<{ drafts: ForkDraft[] }>(`/traces/${traceId}/fork-drafts`);
