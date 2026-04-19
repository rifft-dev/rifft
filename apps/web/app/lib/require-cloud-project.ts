import { redirect } from "next/navigation";
import { resolveActiveProject } from "@/lib/cloud-context";

export const requireCloudProject = async (nextPath = "/onboarding") => {
  const resolution = await resolveActiveProject();
  if (!resolution.projectId || resolution.projectId === "default") {
    const reason =
      resolution.preferredProjectId && !resolution.hasCloudProjects
        ? "session"
        : "workspace";
    redirect(`/bootstrap?next=${encodeURIComponent(nextPath)}&reason=${encodeURIComponent(reason)}`);
  }

  return resolution.projectId;
};

export const redirectToBootstrap = (nextPath = "/onboarding") => {
  redirect(`/bootstrap?next=${encodeURIComponent(nextPath)}&reason=workspace`);
};
