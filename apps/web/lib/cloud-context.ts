import { cookies } from "next/headers";
import { activeProjectCookieName, accessTokenCookieName } from "@/lib/project-cookie";
import {
  resolveActiveProjectFromProjects,
  type ActiveProjectResolution,
} from "@/lib/cloud-context-core";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type CloudProjectsResponse = {
  projects?: Array<{ id: string }>;
};

export const getAccessTokenFromCookies = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(accessTokenCookieName)?.value ?? null;
};

export const resolveActiveProject = async (): Promise<ActiveProjectResolution> => {
  const cookieStore = await cookies();
  const preferredProjectId = cookieStore.get(activeProjectCookieName)?.value ?? null;
  const accessToken = cookieStore.get(accessTokenCookieName)?.value ?? null;

  if (!accessToken) {
    return resolveActiveProjectFromProjects({
      preferredProjectId,
      projects: null,
      state: "unauthenticated",
    });
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/cloud/projects`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return resolveActiveProjectFromProjects({
      preferredProjectId,
      projects: null,
      state: "unavailable",
    });
  }

  if (!response.ok) {
    return resolveActiveProjectFromProjects({
      preferredProjectId,
      projects: null,
      state: "unavailable",
    });
  }

  const body = (await response.json()) as CloudProjectsResponse;
  return resolveActiveProjectFromProjects({
    preferredProjectId,
    projects: body.projects ?? [],
    state: "loaded",
  });
};

export const resolveActiveProjectId = async () => {
  const resolution = await resolveActiveProject();
  return resolution.projectId ?? "default";
};
