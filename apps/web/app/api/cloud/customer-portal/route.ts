import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const polarApiBaseUrl = process.env.POLAR_API_BASE_URL ?? "https://api.polar.sh";

type ProjectResponse = {
  account_id: string | null;
  permissions?: {
    can_manage_billing?: boolean;
  };
};

type PolarCustomerSessionResponse = {
  customer_portal_url?: string;
};

export async function POST() {
  const [projectId, accessToken] = await Promise.all([
    resolveActiveProjectId(),
    getAccessTokenFromCookies(),
  ]);

  if (!projectId || !accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const polarAccessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!polarAccessToken) {
    return NextResponse.json({ error: "polar_not_configured" }, { status: 500 });
  }

  const projectResponse = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!projectResponse.ok) {
    return NextResponse.json({ error: "cloud_context_unavailable" }, { status: 500 });
  }

  const project = (await projectResponse.json()) as ProjectResponse;
  if (!project.account_id) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  if (!project.permissions?.can_manage_billing) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const portalResponse = await fetch(`${polarApiBaseUrl}/v1/customer-sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${polarAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      external_customer_id: project.account_id,
    }),
  });

  if (!portalResponse.ok) {
    const details = await portalResponse.text();
    return NextResponse.json(
      { error: "polar_customer_portal_failed", details },
      { status: portalResponse.status },
    );
  }

  const portalSession = (await portalResponse.json()) as PolarCustomerSessionResponse;
  if (!portalSession.customer_portal_url) {
    return NextResponse.json({ error: "missing_customer_portal_url" }, { status: 500 });
  }

  return NextResponse.json({ url: portalSession.customer_portal_url });
}
