import { cookies } from "next/headers";
import { activeProjectCookieName, accessTokenCookieName } from "@/lib/project-cookie";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type CloudProjectsResponse = {
  projects?: Array<{ id: string }>;
};

export type ActiveProjectResolution = {
  projectId: string | null;
  preferredProjectId: string | null;
  repaired: boolean;
  hasCloudProjects: boolean;
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
    return {
      projectId: preferredProjectId ?? "default",
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
    };
  }

  const response = await fetch(`${apiBaseUrl}/cloud/projects`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {
      projectId: preferredProjectId ?? "default",
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
    };
  }

  const body = (await response.json()) as CloudProjectsResponse;
  const projects = body.projects ?? [];
  if (projects.length === 0) {
    return {
      projectId: null,
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
    };
  }

  if (preferredProjectId && projects.some((project) => project.id === preferredProjectId)) {
    return {
      projectId: preferredProjectId,
      preferredProjectId,
      repaired: false,
      hasCloudProjects: true,
    };
  }

  return {
    projectId: projects[0]?.id ?? preferredProjectId ?? null,
    preferredProjectId,
    repaired: true,
    hasCloudProjects: true,
  };
};

export const resolveActiveProjectId = async () => {
  const resolution = await resolveActiveProject();
  return resolution.projectId ?? "default";
};
