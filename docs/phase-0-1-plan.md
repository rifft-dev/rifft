# Phase 0 and Phase 1 Execution Plan

This plan narrows the original product spec into the next execution path for getting Rifft to a believable public-launch state.

## Objective

Finish Phase 0 and Phase 1 before investing further in Phase 2.

That means:

1. real framework-driven traces, not just sample payloads
2. a trustworthy API and UI for cross-agent debugging
3. enough MAST coverage and launch polish to support a public demo and early users

## Priority order

### Track 1: Instrumentation foundation

Goal: make real CrewAI and AutoGen runs produce real traces in ClickHouse through supported SDKs and adapters.

Milestones:

1. Python SDK completion
   - `rifft.init(...)` configures OTLP export correctly
   - `@rifft.trace(...)` works for sync and async functions
   - `with rifft.span(...)` supports attributes, exceptions, and decision capture
   - arguments, return type, and exceptions are recorded in span attributes
   - basic packaging/install path works

2. CrewAI adapter completion
   - one-line import instrumentation works
   - `crew.kickoff()` creates a root span
   - agent execution creates child spans with `agent_id`
   - tool calls create child spans with `tool.*` attributes
   - a real CrewAI run lands in ClickHouse and renders in the UI

3. AutoGen adapter completion
   - message send/receive spans
   - GroupChat and manager spans
   - visible AutoGen trace in UI

4. MCP adapter completion
   - `call_tool()` tracing in Python and TypeScript
   - propagated trace context

Acceptance bar for Track 1:

- a real CrewAI multi-agent run is visible in Rifft
- a real AutoGen multi-agent run is visible in Rifft
- collector receives traces from supported instrumentation instead of only synthetic fixtures

### Track 2: Phase 1 backend completion

Goal: make the trace model strong enough for public demo and debugging.

Milestones:

1. MAST classifier expansion
   - raise implemented rules from 5 to at least 8
   - prioritize deterministic rules first:
     - `ambiguous_task_description`
     - `incorrect_termination_condition`
     - `unverified_information_propagation`
     - `context_window_overflow`
   - keep per-agent failure attachment consistent

2. Trace data integrity
   - validate per-agent cost and duration against known runs
   - tighten response schemas
   - keep repeated ingest idempotent

3. Performance pass
   - test API latency on larger traces
   - identify obvious query/index bottlenecks

Acceptance bar for Track 2:

- at least 8 MAST modes fire with deterministic tests
- cost and duration accuracy are validated
- Phase 1 API responses are stable and documented

### Track 3: Phase 1 frontend completion

Goal: align the product surface with the public-launch artifact.

Milestones:

1. Trace list polish
   - complete filter bar behavior
   - improve empty and loading states

2. Trace detail polish
   - decide whether to keep custom graph or switch to React Flow
   - complete MAST-specific visual states
   - keep graph, timeline, agent panel, and message panel synchronized

3. Settings and onboarding
   - API key masking/copy/regenerate
   - adapter installation instructions
   - retention controls polish

4. README and docs
   - screenshot or GIF
   - CrewAI quickstart
   - support matrix
   - contributing/docs links

Acceptance bar for Track 3:

- trace detail is compelling enough for public screenshots
- settings page supports first-run self-hosted setup
- README quickstart works end to end

## Immediate implementation sequence

### Slice A

Python SDK + CrewAI adapter

Definition of done:

- Python SDK exports real OTLP spans
- CrewAI adapter auto-instruments on import
- local example or smoke test proves a CrewAI-shaped trace can be produced through the SDK path

### Slice B

AutoGen adapter + second real framework validation

### Slice C

MAST expansion to the launch threshold

### Slice D

Frontend and README launch polish

## What not to prioritize yet

- cloud onboarding
- Supabase account flows
- A2A tracing
- AG-UI tracing
- critical path analysis
- live fork-and-resubmit

Those are important, but they should follow a finished Phase 0 and Phase 1 foundation.
