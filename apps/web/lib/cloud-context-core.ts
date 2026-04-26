export type ActiveProjectResolution = {
  projectId: string | null;
  preferredProjectId: string | null;
  repaired: boolean;
  hasCloudProjects: boolean;
  /** False when the API was unreachable during resolution — lets pages show a connectivity banner. */
  isApiAvailable: boolean;
};

export type CloudProjectsLoadState = "unauthenticated" | "unavailable" | "loaded";

export type CurrentProjectCookieMutation =
  | { kind: "none" }
  | { kind: "set"; projectId: string }
  | { kind: "delete" };

export const resolveActiveProjectFromProjects = ({
  preferredProjectId,
  projects,
  state,
}: {
  preferredProjectId: string | null;
  projects: Array<{ id: string }> | null;
  state: CloudProjectsLoadState;
}): ActiveProjectResolution => {
  if (state === "unauthenticated") {
    return {
      projectId: null,
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
      isApiAvailable: true,
    };
  }

  if (state === "unavailable") {
    return {
      projectId: preferredProjectId ?? "default",
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
      isApiAvailable: false,
    };
  }

  if (!projects || projects.length === 0) {
    return {
      projectId: null,
      preferredProjectId,
      repaired: false,
      hasCloudProjects: false,
      isApiAvailable: true,
    };
  }

  if (preferredProjectId && projects.some((project) => project.id === preferredProjectId)) {
    return {
      projectId: preferredProjectId,
      preferredProjectId,
      repaired: false,
      hasCloudProjects: true,
      isApiAvailable: true,
    };
  }

  return {
    projectId: projects[0]?.id ?? null,
    preferredProjectId,
    repaired: true,
    hasCloudProjects: true,
    isApiAvailable: true,
  };
};

export const getCurrentProjectCookieMutation = (
  resolution: ActiveProjectResolution,
): CurrentProjectCookieMutation => {
  if (resolution.projectId && resolution.repaired) {
    return { kind: "set", projectId: resolution.projectId };
  }

  if (!resolution.projectId && resolution.preferredProjectId) {
    return { kind: "delete" };
  }

  return { kind: "none" };
};
