import { redirect } from "next/navigation";
import { resolveActiveProject } from "@/lib/cloud-context";

export const requireCloudProject = async (nextPath = "/onboarding") => {
  const resolution = await resolveActiveProject();
  if (!resolution.projectId || resolution.projectId === "default") {
    redirect(`/bootstrap?next=${encodeURIComponent(nextPath)}`);
  }

  return resolution.projectId;
};

export const redirectToBootstrap = (nextPath = "/onboarding") => {
  redirect(`/bootstrap?next=${encodeURIComponent(nextPath)}`);
};
