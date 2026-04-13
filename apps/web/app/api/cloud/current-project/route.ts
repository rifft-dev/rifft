import { NextResponse } from "next/server";
import { resolveActiveProject } from "@/lib/cloud-context";
import { activeProjectCookieName } from "@/lib/project-cookie";

export async function GET() {
  const resolution = await resolveActiveProject();
  const response = NextResponse.json({
    projectId: resolution.projectId,
    hasCloudProjects: resolution.hasCloudProjects,
  });

  if (resolution.projectId && resolution.repaired) {
    response.cookies.set(activeProjectCookieName, resolution.projectId, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (!resolution.projectId && resolution.preferredProjectId) {
    response.cookies.delete(activeProjectCookieName);
  }

  return response;
}
