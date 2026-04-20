import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";
import { getRequestOrigin } from "@/lib/request-origin";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ProjectResponse = {
  account_id: string | null;
  permissions?: { can_manage_billing?: boolean };
};

export async function POST(request: Request) {
  const [projectId, accessToken] = await Promise.all([
    resolveActiveProjectId(),
    getAccessTokenFromCookies(),
  ]);

  if (!projectId || !accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const projectResponse = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!projectResponse.ok) {
    const projectError = (await projectResponse.json().catch(() => ({}))) as { error?: string };
    return NextResponse.json(
      { error: projectError.error ?? "cloud_context_unavailable" },
      { status: projectResponse.status === 401 ? 401 : projectResponse.status === 403 ? 403 : 500 },
    );
  }

  const project = (await projectResponse.json()) as ProjectResponse;
  if (!project.account_id) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }
  if (!project.permissions?.can_manage_billing) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const returnUrl = new URL("/settings", getRequestOrigin(request)).toString();

  const portalResponse = await fetch(`${apiBaseUrl}/stripe/customer-portal`, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ account_id: project.account_id, return_url: returnUrl }),
  });

  if (!portalResponse.ok) {
    const portalError = (await portalResponse.json().catch(() => ({}))) as { error?: string };
    const status =
      portalResponse.status === 401 || portalResponse.status === 403 || portalResponse.status === 404
        ? portalResponse.status
        : 500;
    return NextResponse.json({ error: portalError.error ?? "portal_unavailable" }, { status });
  }

  const data = (await portalResponse.json()) as { url?: string };
  if (!data.url) {
    return NextResponse.json({ error: "missing_portal_url" }, { status: 500 });
  }

  return NextResponse.json({ url: data.url });
}
