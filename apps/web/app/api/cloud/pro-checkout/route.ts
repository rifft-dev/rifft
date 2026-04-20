import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAccessTokenFromCookies, resolveActiveProjectId } from "@/lib/cloud-context";
import { getRequestOrigin } from "@/lib/request-origin";
import { handleProCheckout } from "./core";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const result = await handleProCheckout(request, {
    resolveActiveProjectId,
    getAccessTokenFromCookies,
    getStripeSecretKey: () => process.env.STRIPE_SECRET_KEY,
    getPriceId: (planKey) =>
      planKey === "scale" ? process.env.STRIPE_SCALE_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID,
    getRequestOrigin,
    fetchProject: async (projectId, accessToken) => {
      const response = await fetch(`${apiBaseUrl}/projects/${projectId}`, {
        cache: "no-store",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const data = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;

      if (!response.ok) {
        return {
          ok: false as const,
          status: response.status,
          error: typeof data?.error === "string" ? data.error : undefined,
        };
      }

      return {
        ok: true as const,
        data: data as {
          id: string;
          account_id: string | null;
          permissions?: { can_manage_billing?: boolean };
        },
      };
    },
    fetchMe: async (accessToken) => {
      const response = await fetch(`${apiBaseUrl}/cloud/me`, {
        cache: "no-store",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const data = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;

      if (!response.ok) {
        return {
          ok: false as const,
          status: response.status,
          error: typeof data?.error === "string" ? data.error : undefined,
        };
      }

      return {
        ok: true as const,
        data: data as {
          user: { email: string | null; name: string | null };
        },
      };
    },
    createCheckoutSession: async ({
      priceId,
      customerEmail,
      successUrl,
      cancelUrl,
      accountId,
      projectId,
      planKey,
    }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
      return stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: customerEmail,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          account_id: accountId,
          project_id: projectId,
          plan_key: planKey,
        },
        subscription_data: {
          metadata: {
            account_id: accountId,
            project_id: projectId,
            plan_key: planKey,
          },
        },
      });
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
