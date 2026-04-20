import assert from "node:assert/strict";
import test from "node:test";
import { handleProCheckout, type CheckoutSessionInput } from "./core.js";

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request("https://app.rifft.dev/api/cloud/pro-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("handleProCheckout returns 401 when auth context is missing", async () => {
  const result = await handleProCheckout(makeRequest(), {
    resolveActiveProjectId: async () => null,
    getAccessTokenFromCookies: async () => null,
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_pro",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({ ok: false, status: 401 }),
    fetchMe: async () => ({ ok: false, status: 401 }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 401,
    body: { error: "unauthorized" },
  });
});

test("handleProCheckout defaults invalid plan keys to pro", async () => {
  let requestedPlanKey: "pro" | "scale" | null = null;
  let checkoutInput: CheckoutSessionInput | null = null;

  const result = await handleProCheckout(makeRequest({ planKey: "enterprise" }), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: (planKey) => {
      requestedPlanKey = planKey;
      return "price_pro";
    },
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({
      ok: true,
      data: {
        id: "project-1",
        account_id: "account-1",
        permissions: { can_manage_billing: true },
      },
    }),
    fetchMe: async () => ({
      ok: true,
      data: { user: { email: "owner@example.com", name: "Owner" } },
    }),
    createCheckoutSession: async (input) => {
      checkoutInput = input;
      return { url: "https://checkout.example.com/session" };
    },
  });

  assert.equal(requestedPlanKey, "pro");
  if (!checkoutInput) {
    throw new Error("Expected checkout session to be created");
  }
  const recordedCheckoutInput: CheckoutSessionInput = checkoutInput;
  assert.equal(recordedCheckoutInput.planKey, "pro");
  assert.equal(recordedCheckoutInput.priceId, "price_pro");
  assert.deepEqual(result, {
    status: 200,
    body: { url: "https://checkout.example.com/session" },
  });
});

test("handleProCheckout returns 500 when Stripe is not configured", async () => {
  const result = await handleProCheckout(makeRequest(), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => undefined,
    getPriceId: () => "price_pro",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({ ok: false, status: 500 }),
    fetchMe: async () => ({ ok: false, status: 500 }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 500,
    body: { error: "stripe_not_configured" },
  });
});

test("handleProCheckout returns 500 when the selected price is not configured", async () => {
  const result = await handleProCheckout(makeRequest({ planKey: "scale" }), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => undefined,
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({ ok: false, status: 500 }),
    fetchMe: async () => ({ ok: false, status: 500 }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 500,
    body: { error: "price_not_configured" },
  });
});

test("handleProCheckout returns 500 when project or user cloud context cannot be loaded", async () => {
  const result = await handleProCheckout(makeRequest(), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_pro",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({ ok: false, status: 503 }),
    fetchMe: async () => ({ ok: true, data: { user: { email: "owner@example.com", name: null } } }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 500,
    body: { error: "cloud_context_unavailable" },
  });
});

test("handleProCheckout returns 400 when the active project has no account id", async () => {
  const result = await handleProCheckout(makeRequest(), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_pro",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({
      ok: true,
      data: {
        id: "project-1",
        account_id: null,
        permissions: { can_manage_billing: true },
      },
    }),
    fetchMe: async () => ({
      ok: true,
      data: { user: { email: "owner@example.com", name: null } },
    }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 400,
    body: { error: "missing_account_id" },
  });
});

test("handleProCheckout returns 403 when the user cannot manage billing", async () => {
  const result = await handleProCheckout(makeRequest(), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_pro",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({
      ok: true,
      data: {
        id: "project-1",
        account_id: "account-1",
        permissions: { can_manage_billing: false },
      },
    }),
    fetchMe: async () => ({
      ok: true,
      data: { user: { email: "owner@example.com", name: null } },
    }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 403,
    body: { error: "forbidden" },
  });
});

test("handleProCheckout returns 500 when Stripe does not return a checkout url", async () => {
  const result = await handleProCheckout(makeRequest({ planKey: "scale" }), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_scale",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({
      ok: true,
      data: {
        id: "project-1",
        account_id: "account-1",
        permissions: { can_manage_billing: true },
      },
    }),
    fetchMe: async () => ({
      ok: true,
      data: { user: { email: "owner@example.com", name: null } },
    }),
    createCheckoutSession: async () => ({ url: null }),
  });

  assert.deepEqual(result, {
    status: 500,
    body: { error: "missing_checkout_url" },
  });
});

test("handleProCheckout creates a checkout session with the expected metadata and urls", async () => {
  let checkoutInput: CheckoutSessionInput | null = null;

  const result = await handleProCheckout(makeRequest({ planKey: "scale" }), {
    resolveActiveProjectId: async () => "project-1",
    getAccessTokenFromCookies: async () => "token-1",
    getStripeSecretKey: () => "sk_test_mock",
    getPriceId: () => "price_scale",
    getRequestOrigin: () => "https://app.rifft.dev",
    fetchProject: async () => ({
      ok: true,
      data: {
        id: "project-1",
        account_id: "account-1",
        permissions: { can_manage_billing: true },
      },
    }),
    fetchMe: async () => ({
      ok: true,
      data: { user: { email: "owner@example.com", name: "Owner" } },
    }),
    createCheckoutSession: async (input) => {
      checkoutInput = input;
      return { url: "https://checkout.example.com/session" };
    },
  });

  assert.deepEqual(checkoutInput, {
    priceId: "price_scale",
    customerEmail: "owner@example.com",
    successUrl: "https://app.rifft.dev/settings?checkout=success",
    cancelUrl: "https://app.rifft.dev/settings",
    accountId: "account-1",
    projectId: "project-1",
    planKey: "scale",
  });
  assert.deepEqual(result, {
    status: 200,
    body: { url: "https://checkout.example.com/session" },
  });
});
