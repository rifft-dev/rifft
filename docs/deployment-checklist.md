# Rifft Cloud Deployment Checklist

This checklist is for deploying the current hosted Rifft stack and validating the full cloud flow end to end.

It is intentionally practical. The goal is not a perfect production runbook yet. The goal is to get a real hosted environment working, confirm the user journey, and catch the next layer of problems quickly.

## Target services

Deploy these logical services:

- `apps/web`
- `apps/api`
- `packages/collector`
- Postgres
- ClickHouse

Suggested domains:

- `rifft.dev` for the marketing site
- `app.rifft.dev` for the hosted app
- `api.rifft.dev` for the API
- `ingest.rifft.dev` for the collector

## Preflight

Before deployment, confirm:

- Supabase project exists
- GitHub OAuth is enabled in Supabase
- email magic links are enabled in Supabase
- Polar Pro product exists
- Polar webhook endpoint can reach `api.rifft.dev`
- Postgres and ClickHouse are reachable from both `api` and `collector`

## Environment Variables

### Shared infrastructure

These must exist anywhere they are needed by the service:

```bash
DATABASE_URL=postgres://...
CLICKHOUSE_URL=http://...
CLICKHOUSE_USER=...
CLICKHOUSE_PASSWORD=...
```

### `apps/web`

Required:

```bash
NEXT_PUBLIC_API_URL=https://api.rifft.dev
INTERNAL_API_URL=http://api-internal-host:4000
NEXT_PUBLIC_INGEST_URL=https://ingest.rifft.dev
NEXT_PUBLIC_SUPABASE_URL=https://<supabase-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
POLAR_ACCESS_TOKEN=...
POLAR_PRO_PRODUCT_ID=...
POLAR_API_BASE_URL=https://api.polar.sh
```

Notes:

- `INTERNAL_API_URL` is used by server routes inside the web app.
- `POLAR_ACCESS_TOKEN` and `POLAR_PRO_PRODUCT_ID` are server-side only even though they live in the Next app.

### `apps/api`

Required:

```bash
PORT=4000
DATABASE_URL=postgres://...
CLICKHOUSE_URL=http://...
CLICKHOUSE_USER=...
CLICKHOUSE_PASSWORD=...
SUPABASE_URL=https://<supabase-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
POLAR_WEBHOOK_SECRET=...
```

Optional but useful:

```bash
CLICKHOUSE_NATIVE_PORT=9000
```

### `packages/collector`

Required:

```bash
PORT=4318
GRPC_PORT=4317
DATABASE_URL=postgres://...
CLICKHOUSE_URL=http://...
CLICKHOUSE_USER=...
CLICKHOUSE_PASSWORD=...
```

## Supabase Configuration

Configure these redirect URLs:

- local: `http://localhost:3000/auth`
- hosted: `https://app.rifft.dev/auth`

Enable providers:

- GitHub OAuth
- Email magic link

GitHub OAuth should point back to Supabase’s callback URL for your project, then Supabase redirects into `app.rifft.dev/auth`.

## Polar Configuration

### Product

Create one recurring product for Cloud Pro:

- `$29/month`

Keep the product ID and set:

```bash
POLAR_PRO_PRODUCT_ID=...
```

### Webhook

Point Polar webhooks to:

```text
https://api.rifft.dev/webhooks/polar
```

Subscribe at minimum to:

- `subscription.created`
- `subscription.updated`
- `subscription.active`
- `subscription.canceled`
- `subscription.revoked`

Then set:

```bash
POLAR_WEBHOOK_SECRET=...
```

## Deployment Order

Use this order for first deploy:

1. deploy Postgres and ClickHouse
2. deploy `apps/api`
3. deploy `packages/collector`
4. deploy `apps/web`
5. configure Supabase redirects and Polar webhooks
6. smoke test all routes

## Smoke Checks

Run these after deploy:

### Public site

- `rifft.dev` loads
- primary CTA points to `app.rifft.dev/auth`
- pricing section renders

### Auth

- GitHub sign-in works
- magic link sign-in works
- successful login lands in onboarding

### Bootstrap

- first login creates an account/project
- onboarding shows:
  - project ID
  - API key
  - ingest endpoint

### Collector

- `https://ingest.rifft.dev/v1/traces` responds
- invalid bearer token returns `401`
- valid project API key is accepted

### Billing

- Pro-intent flow can open checkout
- webhook hits `api.rifft.dev/webhooks/polar`
- settings flips from Cloud Free to Cloud Pro
- customer portal opens from `Manage billing`

## Manual QA Flow

Use this as the core end-to-end QA path.

### Flow 1: Free onboarding

1. Open `rifft.dev`
2. Click `Start for free`
3. Sign in with GitHub
4. Confirm onboarding shows project credentials
5. Send a trace with the shown project ID, ingest URL, and API key
6. Confirm the first trace appears and opens correctly
7. Confirm home page, incident queue, and trace detail all load

### Flow 2: Pro upgrade

1. Open `rifft.dev`
2. Click the Pro CTA
3. Confirm auth path preserves `?plan=pro`
4. Sign in
5. Confirm onboarding shows the subtle Pro-path state
6. Send a first trace
7. Click `Upgrade to Pro`
8. Complete Polar checkout
9. Return to settings
10. Confirm:
   - success or syncing banner appears
   - webhook sync arrives
   - plan changes to Cloud Pro
   - retention changes to `90 days`
   - `Manage billing` opens the customer portal

### Flow 3: Plan enforcement

1. Use a Cloud Free project
2. Ingest enough spans to approach the monthly limit
3. Confirm the collector rejects over-limit traffic with `429`
4. Upgrade the same account to Pro
5. Retry ingest
6. Confirm ingest succeeds again

## What To Watch Closely

The most likely deployment problems now are:

- wrong `INTERNAL_API_URL` from the web app
- Supabase redirect mismatch
- Polar webhook secret mismatch
- collector not reachable from public internet
- web app creating checkout correctly but webhook failing to map or sync
- SSL / CORS / proxy issues between app, API, and collector

## Fast Debugging Checklist

If upgrade does not reflect in settings:

1. confirm checkout succeeded in Polar
2. confirm webhook delivery succeeded in Polar dashboard
3. confirm `POLAR_WEBHOOK_SECRET` matches deployed API env
4. open Rifft settings and check:
   - subscription state
   - last sync
   - account ID
   - Polar subscription ID
5. verify the checkout session used the correct Rifft account

If traces do not appear:

1. confirm API key copied from onboarding
2. confirm `project_id` matches onboarding
3. confirm endpoint is `https://ingest.rifft.dev`
4. confirm collector is reachable
5. check collector logs for `401`, `429`, or storage errors

## Success Criteria

The deployment is good enough when:

- a new user can sign in and see their first trace
- a free user can hit the usage limit and get a clear failure
- a user can upgrade to Pro through Polar
- the webhook updates the plan correctly
- settings reflects the paid plan and opens billing management
