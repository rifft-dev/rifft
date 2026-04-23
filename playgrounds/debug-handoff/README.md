# Debug Handoff Playground

Internal playground for testing the Rifft debugging experience end to end.

This is not a user-facing example. It exists so we can feel what the product is like when a real-ish multi-agent workflow breaks, inspect the trace, and then compare the fixed run.

## Scenario

Three agents collaborate on a launch-ready incident brief:

- `orchestrator` assigns work and routes handoffs
- `researcher` gathers findings and source confidence
- `writer` drafts the final brief

The broken run fails because the writer trusts a confident-sounding handoff without a validation step. The fixed run adds a verifier stage before the writer finalizes the brief.

## Prerequisites

- Rifft stack running locally, including the collector on `http://localhost:4318`
- Dependencies already installed for this repo

## Run

From the repo root:

```bash
./playgrounds/debug-handoff/run-broken.sh
./playgrounds/debug-handoff/run-fixed.sh
```

Both commands accept these optional environment variables:

```bash
RIFFT_ENDPOINT=http://localhost:4318
RIFFT_PROJECT_ID=default
RIFFT_API_KEY=
```

## What To Look For In Rifft

Broken run:

- direct handoff from `researcher` to `writer`
- mixed-confidence source notes
- no verification span between handoff and final draft
- fatal validation failure on the writer output

Fixed run:

- explicit verifier activity before final draft
- unsupported claim removed or downgraded
- output validation passes
- cleaner graph and timeline than the broken run
