# Contributing

Thanks for helping build Rifft.

## Local setup

1. Copy `.env.example` to `.env`
2. Run `docker compose up -d --build`
3. Open `http://localhost:3000`

For faster frontend iteration, run the infra stack in Docker and the web app locally with:

```bash
pnpm --filter @rifft/web dev
```

## Useful commands

```bash
pnpm typecheck
pnpm build
pnpm test
```

Targeted examples:

```bash
pnpm --filter ./packages/sdk-js exec tsx --test tests/smoke.test.ts
PYTHONPATH=packages/sdk-python/src:packages/adapters/crewai/src python3 -m unittest packages/adapters/crewai/tests/test_smoke.py
```

## Demo data

If your local trace list is polluted by stale smoke runs, use:

```bash
./scripts/cleanup-demo-traces.sh
```

## Scope

Before adding new product surface area, check:

- [docs/implementation-tracker.md](/Users/ned/Documents/GitHub/Rifft/docs/implementation-tracker.md)
- [docs/phase-0-1-plan.md](/Users/ned/Documents/GitHub/Rifft/docs/phase-0-1-plan.md)

Phase 0 and Phase 1 completion take priority over deeper Phase 2 work.
