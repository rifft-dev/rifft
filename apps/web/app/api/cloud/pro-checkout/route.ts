import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const polarApiBaseUrl = process.env.POLAR_API_BASE_URL ?? "https://api.polar.sh";

type ProjectResponse = {
  id: string;
  account_id: string | null;
  permissions?: {
    can_manage_billing?: boolean;
  };
};

type MeResponse = {
  user: {
    email: string | null;
    name: string | null;
  };
};

type PolarCheckoutResponse = {
  url?: string;
};

export async function POST(request: Request) {
  const [projectId, accessToken] = await Promise.all([
    resolveActiveProjectId(),
    getAccessTokenFromCookies(),
  ]);

  if (!projectId || !accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const polarAccessToken = process.env.POLAR_ACCESS_TOKEN;
  const polarProProductId = process.env.POLAR_PRO_PRODUCT_ID;
  if (!polarAccessToken || !polarProProductId) {
    return NextResponse.json({ error: "polar_not_configured" }, { status: 500 });
  }

  const [projectResponse, meResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/projects/${projectId}`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    }),
    fetch(`${apiBaseUrl}/cloud/me`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    }),
  ]);

  if (!projectResponse.ok || !meResponse.ok) {
    return NextResponse.json({ error: "cloud_context_unavailable" }, { status: 500 });
  }

  const project = (await projectResponse.json()) as ProjectResponse;
  const me = (await meResponse.json()) as MeResponse;

  if (!project.account_id) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  if (!project.permissions?.can_manage_billing) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const successUrl = new URL("/settings?checkout=success", request.url).toString();

  const polarResponse = await fetch(`${polarApiBaseUrl}/v1/checkouts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${polarAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [polarProProductId],
      external_customer_id: project.account_id,
      customer_email: me.user.email ?? undefined,
      customer_name: me.user.name ?? undefined,
      success_url: successUrl,
      metadata: {
        account_id: project.account_id,
        project_id: project.id,
        plan_key: "pro",
      },
      customer_metadata: {
        account_id: project.account_id,
        project_id: project.id,
        plan_key: "pro",
      },
    }),
  });

  if (!polarResponse.ok) {
    const details = await polarResponse.text();
    return NextResponse.json(
      { error: "polar_checkout_failed", details },
      { status: polarResponse.status },
    );
  }

  const polarCheckout = (await polarResponse.json()) as PolarCheckoutResponse;
  if (!polarCheckout.url) {
    return NextResponse.json({ error: "missing_checkout_url" }, { status: 500 });
  }

  return NextResponse.json({ url: polarCheckout.url });
}
