# Debug Handoff App

Internal app-shaped playground for testing Rifft like a user would.

Unlike the lower-level trace fixture in `playgrounds/debug-handoff/`, this playground behaves more like a small customer app:

- it has its own `package.json`
- it imports `@rifft-dev/rifft` like a normal consumer
- it reads configuration from environment variables
- it runs as a separate app process that exports traces into a running Rifft stack

## Scenario

Three agents collaborate on a launch-ready incident brief:

- `orchestrator` assigns work
- `researcher` gathers findings and source confidence
- `writer` drafts the final brief

The broken run lets an unsupported claim pass straight from research into the final draft. The fixed run adds a verifier step before the writer finalizes the brief.

## Setup

Use this playground the same way a real user would use Rifft: create or select a project in the app, copy that project's ingest details, then run this separate app with those values.

1. Start Rifft and open the web app.
2. Create or select the project you want to test with.
3. Copy the project ID, ingest endpoint, and API key from the Rifft app.
4. Copy `.env.example` to `.env`.
5. Paste the project values into `.env`.

Example:

```bash
cp playgrounds/debug-handoff-app/.env.example playgrounds/debug-handoff-app/.env
```

The `.env` file should end up looking like this:

```bash
RIFFT_ENDPOINT=http://localhost:4318
RIFFT_PROJECT_ID=your-project-id
RIFFT_API_KEY=your-project-api-key
```

For a local self-hosted project, the endpoint is usually `http://localhost:4318`. For a hosted/cloud project, use the ingest endpoint shown in the app.

The important thing is that the playground app and the Rifft UI point at the same project. If the project ID or API key belongs to a different project, the traces may export successfully but show up somewhere else.

## Run

From the repo root:

```bash
pnpm --dir playgrounds/debug-handoff-app broken
pnpm --dir playgrounds/debug-handoff-app fixed
```

From inside the playground:

```bash
pnpm broken
pnpm fixed
```

## Environment

The app reads these values:

```bash
RIFFT_ENDPOINT=http://localhost:4318
RIFFT_PROJECT_ID=default
RIFFT_API_KEY=
```

If `.env` exists, the runner scripts load it before starting the app.

## What To Look For In Rifft

Broken run:

- direct `researcher -> writer` handoff
- mixed-confidence sources
- no verifier stage
- fatal writer output-validation failure

Fixed run:

- explicit `researcher -> verifier -> writer` flow
- unsupported claim removed before drafting
- successful output validation
- clearer graph and timeline than the broken run

## How To Debug It In The App

After running the broken scenario:

1. Open Rifft and go to the traces list.
2. Find the newest trace for this playground run.
3. Open the trace detail page.
4. Start in the graph view and confirm the broken path is a direct `researcher -> writer` handoff with no verifier in between.
5. Click the `writer` span and inspect its attributes.
6. Look for the draft claims and the decision payload showing that the writer assumed the strongest claim was already verified.
7. Open the `rifft.agent_to_agent` handoff span from `researcher` to `writer`.
8. Inspect the message payload and note that it contains mixed-confidence sources plus the unsupported claim.
9. Open the `output.validate` span on the writer.
10. Confirm the rejection event and the fatal failure caused by the unsupported claim.

After running the fixed scenario:

1. Return to the traces list and open the newest fixed trace.
2. Confirm the graph now shows `researcher -> verifier -> writer`.
3. Open the verifier span and inspect `verification.removed_claims`.
4. Open the writer span and verify the unsupported claim is no longer in the final draft claims.
5. Open the validation span and confirm it passed.
6. Compare the broken and fixed traces to see how the extra verification stage changes the graph, timeline, and final outcome.
