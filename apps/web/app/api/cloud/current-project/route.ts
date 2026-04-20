import { NextResponse } from "next/server";
import { resolveActiveProject } from "@/lib/cloud-context";
import { getCurrentProjectCookieMutation } from "@/lib/cloud-context-core";
import { activeProjectCookieName } from "@/lib/project-cookie";

export async function GET() {
  const resolution = await resolveActiveProject();
  const response = NextResponse.json({
    projectId: resolution.projectId,
    hasCloudProjects: resolution.hasCloudProjects,
  });

  const cookieMutation = getCurrentProjectCookieMutation(resolution);
  if (cookieMutation.kind === "set") {
    response.cookies.set(activeProjectCookieName, cookieMutation.projectId, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (cookieMutation.kind === "delete") {
    response.cookies.delete(activeProjectCookieName);
  }

  return response;
}
