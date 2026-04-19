import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";
import { getRequestOrigin } from "@/lib/request-origin";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ProjectResponse = {
  id: string;
  account_id: string | null;
  permissions?: { can_manage_billing?: boolean };
};

type MeResponse = {
  user: { email: string | null; name: string | null };
};

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  scale: process.env.STRIPE_SCALE_PRICE_ID,
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

  const body = (await request.json().catch(() => ({}))) as { planKey?: string };
  const planKey = body.planKey === "scale" ? "scale" : "pro";
  const priceId = PRICE_IDS[planKey];
  if (!priceId) {
    return NextResponse.json({ error: "price_not_configured" }, { status: 500 });
  }

  const [projectResponse, meResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/projects/${projectId}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${apiBaseUrl}/cloud/me`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
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

  const stripe = new Stripe(stripeSecretKey);
  const requestOrigin = getRequestOrigin(request);
  const successUrl = new URL("/settings?checkout=success", requestOrigin).toString();
  const cancelUrl = new URL("/settings", requestOrigin).toString();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: me.user.email ?? undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      account_id: project.account_id,
      project_id: project.id,
      plan_key: planKey,
    },
    subscription_data: {
      metadata: {
        account_id: project.account_id,
        project_id: project.id,
        plan_key: planKey,
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "missing_checkout_url" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
