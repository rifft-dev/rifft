# Rifft Cloud MVP

This document defines the minimum hosted product required to make Rifft Cloud real.

It is intentionally narrow. The goal is not to launch the final SaaS. The goal is to turn the current self-hosted open-source product into a paid hosted product with a clean upgrade path.

## Goal

Launch a hosted version of Rifft that lets a developer:

1. create an account
2. create a project
3. send spans to a hosted ingest endpoint
4. view traces in the hosted UI
5. stay on a free cloud tier or upgrade to Pro

Anything not required for that flow should be treated as out of scope for the MVP.

## Product shape

Rifft will have three visible paths:

- Self-hosted: free forever
- Cloud Free: `50K spans/month`, `14-day retention`
- Cloud Pro: `$49/month`, `500K spans/month`, `90-day retention`, `$5 per 100K` spans above `500K`

Initial cloud positioning:

- same core debugger experience as self-hosted
- hosted by Rifft
- no Docker or infra setup
- account, project, and billing management built in

## MVP scope

### In scope

- hosted web app
- hosted API
- hosted collector / ingest endpoint
- user authentication
- project ownership and membership
- project API keys
- cloud usage metering
- retention enforcement
- Polar subscription checkout
- free vs Pro plan enforcement
- pricing and upgrade UI

### Out of scope

- team tier
- enterprise tier
- SAML / SSO
- sales-managed contracts
- multi-org admin roles beyond the minimum needed
- advanced billing experiments
- usage-based feature flags beyond spans and retention
- hosted fork re-submit to live agents

## Principles

- Preserve the open-source self-hosted product as a first-class path.
- Keep cloud architecture close to the current runtime architecture.
- Monetize on hosting, convenience, retention, and scale before monetizing on core visibility.
- Prefer one excellent cloud onboarding path over broad framework promises.
- Keep the first cloud launch honest: no claims that exceed shipped behavior.

## Current starting point

The repository already provides the core runtime pieces needed for cloud:

- `apps/web`: Next.js debugger UI
- `apps/api`: Fastify API
- `packages/collector`: OTLP ingest and classification pipeline
- Postgres: project metadata and summaries
- ClickHouse: span storage

The main missing pieces are:

- auth
- project ownership
- hosted API key flow
- usage tracking
- retention jobs
- billing state
- removal of single-project assumptions in the UI

## Target user flow

### Cloud Free

1. User lands on `rifft.dev`.
2. User clicks a cloud CTA.
3. User signs up.
4. User creates a project.
5. User receives:
   - project ID
   - API key
   - hosted OTLP endpoint
6. User updates SDK config and sends traces.
7. User sees traces in the hosted UI.
8. User sees plan, usage, and retention status in settings.

### Upgrade to Pro

1. User reaches the upgrade CTA from pricing, settings, or usage warnings.
2. User completes Polar checkout.
3. Webhook updates subscription state.
4. Project plan changes to Pro.
5. Retention and usage limits update immediately.

## Cloud architecture

### Services

Use the same logical services as self-hosted:

- `apps/web`: hosted product UI and marketing landing page
- `apps/api`: hosted application API
- `packages/collector`: hosted ingest service
- Postgres: accounts, projects, subscriptions, usage summaries, trace metadata
- ClickHouse: spans and related event records

### Suggested domains

- `rifft.dev`: marketing site
- `app.rifft.dev`: hosted product UI
- `api.rifft.dev`: application API
- `ingest.rifft.dev`: OTLP ingest endpoint

This keeps the mental model simple and makes SDK examples easy to understand.

## Authentication

### Recommendation

Use Supabase Auth for the MVP.

Reasons:

- the repo already anticipates Supabase-backed auth
- email/password and magic-link flows can ship quickly
- session handling is straightforward for a small hosted app
- it reduces time spent building account primitives from scratch

### MVP auth requirements

- sign up
- sign in
- sign out
- password reset or magic-link recovery
- authenticated access to app routes

Social auth can wait.

## Data model

### New core entities

- `users`
- `accounts`
- `account_memberships`
- `projects`
- `project_memberships`
- `api_keys`
- `subscriptions`
- `usage_monthly`
- `billing_events`

### Suggested ownership model

Use `accounts` as the top-level billing owner, even if each early user only has one account.

That gives a clean future path to:

- multi-project teams
- shared billing
- later Team plans

without forcing a schema rewrite.

### Minimum schema expectations

#### `accounts`

- `id`
- `name`
- `created_at`
- `updated_at`

#### `account_memberships`

- `account_id`
- `user_id`
- `role`

#### `projects`

- `id`
- `account_id`
- `name`
- `environment`
- `retention_days`
- `plan`
- `created_at`
- `updated_at`

#### `project_memberships`

- `project_id`
- `user_id`
- `role`

#### `api_keys`

- `id`
- `project_id`
- `name`
- `key_hash`
- `last_used_at`
- `revoked_at`
- `created_at`

#### `subscriptions`

- `id`
- `account_id`
- `provider`
- `provider_subscription_id`
- `status`
- `plan`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `created_at`
- `updated_at`

#### `usage_monthly`

- `project_id`
- `month_start`
- `span_count`
- `last_ingested_at`
- `updated_at`

## Plan model

### Cloud Free

- `50K spans/month`
- `14-day retention`
- all core hosted debugging features
- community support

### Cloud Pro

- `$49/month`
- `500K spans/month`
- `90-day retention`
- email support
- overage billing at `$5 per 100K` spans above `500K`

### Self-hosted

- free forever
- unlimited local retention subject to user infrastructure
- no hosted billing relationship

## Feature gating

The cloud MVP should not cripple the free tier so much that users never reach the core product value.

### Free cloud should include

- trace list
- trace detail
- graph view
- timeline view
- agent detail
- current replay experience
- current causal attribution experience

### Pro should monetize primarily on

- higher monthly span limits
- longer retention
- hosted operational convenience
- support

Feature gating can get more sophisticated later, but the MVP should prioritize conviction over artificial upsell pressure.

## Ingest and API key model

### Hosted ingest config

Cloud projects should use:

- `project_id`
- `api_key`
- `https://ingest.rifft.dev`

Example:

```python
rifft.init(
    project_id="proj_123",
    endpoint="https://ingest.rifft.dev",
    api_key="rifft_..."
)
```

### Collector requirements

- authenticate incoming cloud ingest requests by API key
- resolve API key to project
- attach the correct project ID during normalization
- reject invalid or revoked keys
- update project usage counters on successful ingest

Self-hosted mode should continue to work without this hosted key flow.

## Usage metering

### Billing unit

Use ingested spans as the only billing unit for MVP cloud pricing.

### Metering requirements

- count spans per project per calendar billing month
- expose current month usage in the app
- warn users as they approach limits
- hard-stop or soft-stop Free when usage exceeds `50K`
- keep Pro ingest active and accumulate overage usage

### Recommendation

For MVP, use a hard limit on Free and tracked overages on Pro.

That keeps the plan easy to explain.

## Retention enforcement

Retention must be enforced with a scheduled cleanup job.

### Rules

- Free: delete trace data older than `14 days`
- Pro: delete trace data older than `90 days`

### Requirements

- retention should be derived from project plan
- cleanup must affect both ClickHouse span data and related Postgres summaries where needed
- settings UI should clearly show retention for the active project

## Billing

### Recommendation

Use Polar for MVP subscriptions.

Reasons:

- faster path to a working subscription flow
- simpler tax handling early on
- enough capability for Free and Pro plans

### Required billing flow

- checkout link or embedded checkout for Pro
- webhook endpoint in `apps/api`
- subscription create / update / cancel synchronization
- account plan state stored in Postgres
- billing management link in settings

### Billing events to handle

- subscription created
- subscription activated
- subscription updated
- subscription canceled
- payment failed if exposed in the chosen flow

## App changes required

### `apps/web`

- remove hardcoded `default` project assumptions
- add authenticated app shell
- add project creation flow
- add API key management UI
- add usage and billing settings UI
- add upgrade CTA and plan badge

### `apps/api`

- add authenticated project-aware routes
- authorize project access by membership
- add billing webhook endpoints
- add usage endpoints
- add API key creation / revoke endpoints

### `packages/collector`

- validate hosted API keys
- resolve project ownership from API key
- update usage counters
- preserve self-hosted behavior

## Website changes required

The marketing site should now communicate three paths clearly:

- self-hosted
- cloud free
- cloud Pro

### Required site updates

- add pricing section
- add cloud CTA
- add hosted onboarding copy
- keep self-hosted visible as a trust signal
- remove or rewrite any claims that exceed shipped cloud behavior

## Deployment requirements

### MVP target

One production environment is enough to start:

- marketing site
- hosted app
- hosted API
- hosted collector
- managed Postgres
- managed ClickHouse

### Nice to keep simple

- one cloud region initially
- no multi-region ingest
- no dedicated per-customer deployments

## First implementation slices

Build in this order.

### Slice 1: Accounts and projects

- add auth
- add accounts/projects/memberships schema
- remove `default` project assumptions
- add project picker or single-project landing flow

### Slice 2: Hosted API keys and ingest auth

- create project API keys
- validate keys in collector
- route spans into the correct project

### Slice 3: Usage and retention

- monthly span counting
- usage UI
- retention worker
- Free plan enforcement

### Slice 4: Polar billing

- checkout
- webhook sync
- Pro plan activation
- billing state in settings

### Slice 5: Pricing and launch surfaces

- website pricing section
- app upgrade flow
- onboarding docs for cloud

## Definition of done for cloud MVP

Cloud MVP is done when:

1. a new user can sign up without operator help
2. a new cloud project can be created in the UI
3. the user can copy a hosted endpoint and API key
4. traces sent to the hosted endpoint appear in the hosted UI
5. Free limits and retention are enforced
6. a user can upgrade to Pro through Polar
7. Pro limits and retention apply correctly after upgrade
8. the website and docs describe the product honestly

## What not to build before launch

- Team tier
- Enterprise tier
- SSO
- custom contracts
- advanced seat logic
- complex role systems
- broad feature packaging experiments
- full hosted/live fork re-submit

## Immediate next tasks

1. pick the auth approach and formalize the initial schema
2. remove the `default` project assumption from the app and API flow
3. implement project API key generation and collector-side validation
4. add usage metering and retention enforcement
5. wire Polar subscriptions
6. update the site and docs to introduce cloud
