export type ProjectResponse = {
  id: string;
  account_id: string | null;
  permissions?: { can_manage_billing?: boolean };
};

export type MeResponse = {
  user: { email: string | null; name: string | null };
};

export type CheckoutResult = {
  status: number;
  body: Record<string, unknown>;
};

export type ErrorResponse = {
  ok: false;
  status: number;
  error?: string;
};

export type CheckoutSessionInput = {
  priceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  accountId: string;
  projectId: string;
  planKey: "pro" | "scale";
};

type CheckoutDeps = {
  resolveActiveProjectId: () => Promise<string | null>;
  getAccessTokenFromCookies: () => Promise<string | null>;
  getStripeSecretKey: () => string | undefined;
  getPriceId: (planKey: "pro" | "scale") => string | undefined;
  getRequestOrigin: (request: Request) => string;
  fetchProject: (
    projectId: string,
    accessToken: string,
  ) => Promise<{ ok: true; data: ProjectResponse } | ErrorResponse>;
  fetchMe: (accessToken: string) => Promise<{ ok: true; data: MeResponse } | ErrorResponse>;
  createCheckoutSession: (
    input: CheckoutSessionInput,
  ) => Promise<{ url?: string | null }>;
};

export const handleProCheckout = async (
  request: Request,
  deps: CheckoutDeps,
): Promise<CheckoutResult> => {
  const [projectId, accessToken] = await Promise.all([
    deps.resolveActiveProjectId(),
    deps.getAccessTokenFromCookies(),
  ]);

  if (!projectId || !accessToken) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const stripeSecretKey = deps.getStripeSecretKey();
  if (!stripeSecretKey) {
    return { status: 500, body: { error: "stripe_not_configured" } };
  }

  const body = (await request.json().catch(() => ({}))) as { planKey?: string };
  const planKey: "pro" | "scale" = body.planKey === "scale" ? "scale" : "pro";
  const priceId = deps.getPriceId(planKey);
  if (!priceId) {
    return { status: 500, body: { error: "price_not_configured" } };
  }

  const [projectResponse, meResponse] = await Promise.all([
    deps.fetchProject(projectId, accessToken),
    deps.fetchMe(accessToken),
  ]);

  if (!projectResponse.ok) {
    const error = projectResponse.error;
    const status = projectResponse.status;
    return {
      status: status === 401 ? 401 : status === 403 ? 403 : status === 404 ? 404 : 500,
      body: { error: error ?? "cloud_context_unavailable" },
    };
  }

  if (!meResponse.ok) {
    const error = meResponse.error;
    const status = meResponse.status;
    return {
      status: status === 401 ? 401 : 500,
      body: { error: error ?? "cloud_context_unavailable" },
    };
  }

  const project = projectResponse.data;
  const me = meResponse.data;

  if (!project.account_id) {
    return { status: 400, body: { error: "missing_account_id" } };
  }

  if (!project.permissions?.can_manage_billing) {
    return { status: 403, body: { error: "forbidden" } };
  }

  const requestOrigin = deps.getRequestOrigin(request);
  const successUrl = new URL("/settings?checkout=success", requestOrigin).toString();
  const cancelUrl = new URL("/settings", requestOrigin).toString();
  const session = await deps.createCheckoutSession({
    priceId,
    customerEmail: me.user.email ?? undefined,
    successUrl,
    cancelUrl,
    accountId: project.account_id,
    projectId: project.id,
    planKey,
  });

  if (!session.url) {
    return { status: 500, body: { error: "missing_checkout_url" } };
  }

  return { status: 200, body: { url: session.url } };
};
