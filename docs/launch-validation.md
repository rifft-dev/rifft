# Launch Validation

This checklist tracks the current public-launch readiness of the self-hosted Phase 1 product.

## Verified recently

- `docker compose up -d --build` was rerun on March 26, 2026 in this environment and completed in `64s` after a fresh `docker compose down`; all five services reported healthy afterward, and `/api/health`, `/health`, and `/traces` all responded successfully.
- Collector OTLP HTTP ingest is working end to end into ClickHouse and Postgres.
- Collector OTLP gRPC ingest is also working end to end into ClickHouse and Postgres.
- The API trace list, trace detail, graph, timeline, fork drafts, and agent-detail endpoints are live.
- The web app is serving the trace list, trace detail, settings page, replay controls, and message overlays.
- Live smoke traces currently exist for:
  - Python SDK
  - TypeScript SDK
  - CrewAI adapter
  - AutoGen adapter
  - MCP adapter
- Python MCP parity is now in place and collector-backed validation exists for both TypeScript and Python MCP adapters.
- Real-package no-key runtime validation now exists for CrewAI and AutoGen adapters.
- Real model-backed validation now exists for:
  - CrewAI
  - AutoGen
- Exporter noise from non-Rifft Python spans was filtered out, and stale pre-fix validation traces were cleaned from storage.
- Demo-facing thresholds were raised so fresh real-framework validation traces render cleanly.
- Recent MAST severity-quality tuning removed duplicate `missing_output_validation` noise from failing final-agent traces, and stored traces were reclassified with the updated logic.
- The synthetic `perftrace-1000` benchmark was removed from the live launch dataset after performance validation so benchmark-induced `infinite_loop_risk` noise does not skew current MAST review.
- Chrome console/runtime QA is clean on:
  - `/traces`
  - a clean CrewAI trace detail page
  - a clean AutoGen trace detail page
  - `/settings`
- Firefox headless route/runtime QA is clean on:
  - `/traces`
  - a clean CrewAI trace detail page
  - a clean AutoGen trace detail page
  - `/settings`
  - only Firefox-internal startup warnings were observed in driver logs, not app-specific errors
- `apps/web` is upgraded to `next@15.5.14`; local `npm audit` is clean, local build/typecheck pass, and the rebuilt Docker web service is healthy.
- API performance was measured against a live 1001-span trace (`perftrace-1000`) and stayed well below the 500ms target:
  - trace list: avg `16.8ms`
  - trace detail: avg `17.14ms`
  - graph: avg `11.94ms`
  - timeline: avg `13.6ms`
  - agent detail: avg `10.05ms`
  - batch agent details: avg `9.59ms`

## Still required before public launch

- Do one truly pristine clean-machine quickstart pass to eliminate Docker cache/local-environment bias from the current timing result.

### How to close the final caveat

Run this on a genuinely fresh host after cloning the repo:

```bash
pnpm validate:self-host
```

Record:

- the reported `startup_seconds`
- the `docker compose ps` output
- the `web_health`, `api_health`, and `traces_status` lines

If that fresh-host run stays healthy and under the 2-minute bar, the last honest Phase 0/1 launch caveat is closed.

## Environment limits in this validation

- This repo-side validation can confirm Docker startup, live HTTP responses, and API timings.
- It can now confirm Chrome console/runtime state through headless DevTools automation.
- It can also confirm Firefox route/runtime state through Selenium-driven headless checks, but Firefox console visibility is still somewhat noisier because driver logs include browser-internal warnings.

## Current known gaps

- This validation is still from a reused development machine, not a brand-new host.
- MAST rule coverage is implemented for all 14 modes. In the current live dataset, the remaining persisted failure is down to one intentional fatal `agent_communication_failure` sample.
- README badges are placeholder-style rather than package-release backed.
- Some older historical demo traces still remain in local storage, even though the main pre-fix validation noise has been cleaned up.
