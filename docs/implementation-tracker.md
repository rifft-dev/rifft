# Rifft Implementation Tracker

This document maps the original Rifft product spec to the current repository state.

For the forward-looking roadmap focused on making the product exceptional rather than merely complete, see [docs/exceptional-roadmap.md](/Users/ned/Documents/GitHub/Rifft/docs/exceptional-roadmap.md).

Status keys:

- `done` means implemented and verified in this repo
- `partial` means present in some form, but not fully at spec
- `missing` means not implemented yet

## Project identity

| Area | Status | Notes |
| --- | --- | --- |
| Open-source multi-agent debugger positioning | `done` | Reflected in product copy and current UI/API direction. |
| MIT licence | `partial` | Mentioned in docs, but this tracker does not verify a dedicated `LICENSE` file. |
| TypeScript monorepo + Node backend + Python SDK package layout | `done` | Repo structure exists and is wired. |
| Supabase auth reuse | `missing` | Env placeholders exist, but product auth flow is not implemented. |
| Self-hosted via Docker Compose | `done` | Stack runs via `docker compose up -d --build`. |
| No cloud infra for first 6 months | `done` | Current implementation is self-hosted only. |

## Guardrails

| Area | Status | Notes |
| --- | --- | --- |
| Not a prompt management product | `done` | No prompt management UI exists. |
| Not an eval/scoring product | `done` | No eval/scoring features exist. |
| Not an AI gateway/proxy | `done` | No proxy layer exists. |
| Not general APM | `done` | Product is trace/debug oriented. |
| Not single-call tracing as primary feature | `done` | Current UI centers on agent-to-agent traces. |

## Monorepo structure

| Area | Status | Notes |
| --- | --- | --- |
| `packages/collector` | `done` | Collector service exists and persists trace data. |
| `packages/sdk-python` | `partial` | Package scaffold exists, but full SDK behavior is not complete. |
| `packages/sdk-js` | `partial` | Package scaffold exists, but full SDK behavior is not complete. |
| `packages/adapters/crewai` | `partial` | Package structure exists, not full auto-instrumentation spec. |
| `packages/adapters/autogen` | `partial` | Package structure exists, not full adapter behavior. |
| `packages/adapters/mcp` | `partial` | Package structure exists, not full adapter behavior. |
| `apps/web` | `done` | Next.js app is running and wired to the API. |
| `apps/api` | `done` | Fastify API is running and backed by storage. |
| `infra/docker` | `partial` | Infra assets exist, but root `docker-compose.yml` is the main entrypoint right now. |
| `docs` | `done` | Architecture doc and this tracker now exist. |

## Phase 0: Foundation

### Collector

| Requirement | Status | Notes |
| --- | --- | --- |
| OTLP HTTP ingest on `4318` | `done` | Verified live with sample OTLP payloads. |
| OTLP gRPC ingest on `4317` | `partial` | Port/service wiring exists, but not fully implemented to spec. |
| Write spans to ClickHouse `rifft.spans` | `done` | Verified with live sample traces. |
| Write trace/project metadata to Postgres | `done` | `projects` and `traces` are persisted and queried by the API. |
| `GET /health` on collector | `done` | Implemented and used by Docker healthcheck. |
| Real CrewAI trace lands in ClickHouse | `partial` | Sample CrewAI-shaped traces are flowing; a real adapter-driven CrewAI run is not yet verified end to end. |

### Python SDK

| Requirement | Status | Notes |
| --- | --- | --- |
| `rifft.init(...)` | `partial` | Starter implementation exists, not fully validated to spec. |
| `@rifft.trace(...)` decorator | `partial` | Package scaffold exists, but behavior is not fully completed and verified. |
| `with rifft.span(...)` context manager | `partial` | Partial scaffold only. |
| Automatic capture of args, return type, duration, exceptions | `missing` | Not fully implemented and verified. |
| Thread-safe + asyncio support | `missing` | Not validated. |
| Minimal dependency promise | `partial` | Intended, but not fully audited. |

### TypeScript SDK

| Requirement | Status | Notes |
| --- | --- | --- |
| `init(...)` | `partial` | Scaffold exists, not fully productionized. |
| Decorator / wrapper API matching Python | `partial` | Not complete to spec. |
| Node 18+ support | `partial` | Likely compatible, but not formally verified as a release artifact. |

### CrewAI adapter

| Requirement | Status | Notes |
| --- | --- | --- |
| One-line import instrumentation | `partial` | Package path exists; automatic runtime instrumentation is not complete. |
| Root trace on `crew.kickoff()` | `missing` | Not implemented as a real adapter integration. |
| Agent task child spans | `missing` | Not adapter-driven yet. |
| Inter-agent message spans | `missing` | Sample data supports this model, but adapter automation is not built. |
| Tool-call spans | `missing` | Sample data supports this model, but adapter automation is not built. |
| Trace context propagation | `missing` | Not implemented. |
| Framework attribute set to `crewai` | `partial` | Data model supports it; adapter automation missing. |

### AutoGen adapter

| Requirement | Status | Notes |
| --- | --- | --- |
| One-line import instrumentation | `partial` | Package path exists. |
| Message send/receive hooks | `missing` | Not implemented. |
| GroupChat / manager tracing | `missing` | Not implemented. |
| Sender/receiver capture | `missing` | Not implemented in adapter. |
| Framework attribute set to `autogen` | `partial` | Data model supports it; adapter automation missing. |

### MCP adapter

| Requirement | Status | Notes |
| --- | --- | --- |
| MCP `call_tool()` instrumentation | `missing` | Not implemented. |
| MCP attribute schema | `missing` | Not implemented. |
| W3C trace propagation in MCP headers | `missing` | Not implemented. |
| Python + TypeScript client support | `missing` | Not implemented. |

### Docker / infra

| Requirement | Status | Notes |
| --- | --- | --- |
| `collector`, `api`, `web`, `clickhouse`, `postgres` services | `done` | All five services exist. |
| Single command startup | `done` | `docker compose up -d --build` works. |
| Healthchecks on each service | `done` | All services are now reporting healthy. |
| Healthy before accepting traffic | `partial` | Compose dependency ordering is in place; broader readiness guarantees are still basic. |

## Phase 1: Cross-agent trace viewer

### API

| Requirement | Status | Notes |
| --- | --- | --- |
| `GET /projects` | `done` | Implemented. |
| `POST /projects` | `done` | Implemented. |
| `GET /projects/:id/traces` | `done` | Implemented with pagination/filter support. |
| `GET /traces/:trace_id` | `done` | Implemented with full trace detail. |
| `GET /traces/:trace_id/graph` | `done` | Implemented. |
| `GET /traces/:trace_id/timeline` | `done` | Implemented. |
| `GET /traces/:trace_id/agents/:agent_id` | `done` | Implemented. |
| `GET /health` | `done` | Implemented. |
| Trace list response shape | `partial` | Very close, but may still drift from final launch schema. |
| Graph response shape | `partial` | Implemented and extended with extra fields like causal attribution. |

### Web: trace list

| Requirement | Status | Notes |
| --- | --- | --- |
| `/` or `/traces` list page | `done` | Implemented. |
| Status / trace / time / duration / agent count / cost / frameworks / failure count columns | `done` | Present in live UI. |
| Click row to open trace | `done` | Implemented. |
| Filter bar: status / framework / date range | `partial` | Filtering UI exists in limited form; not fully completed to spec. |

### Web: trace detail

| Requirement | Status | Notes |
| --- | --- | --- |
| `/traces/:trace_id` route | `done` | Implemented. |
| Graph view | `done` | Implemented as custom interactive graph. |
| Timeline view | `done` | Implemented as custom visual timeline. |
| React Flow graph | `missing` | Current graph is custom SVG/layout, not React Flow. |
| Node styling for status/failure | `partial` | Status and root-cause styling exist; MAST-specific amber treatment is not complete. |
| Edge labels and status colouring | `partial` | Basic labels and selection exist; not all spec styling rules are complete. |
| Click node opens agent panel | `done` | Implemented. |
| Click edge opens message panel | `done` | Implemented. |
| Failure banner above graph | `done` | Implemented. |
| Timeline as Gantt-style view | `done` | Implemented. |

### Web: agent detail panel

| Requirement | Status | Notes |
| --- | --- | --- |
| Summary | `done` | Implemented. |
| Messages | `done` | Implemented. |
| Tool calls | `done` | Implemented. |
| MAST failures | `done` | Implemented. |
| Decision context | `partial` | Rendered when available, but automatic capture is not complete. |
| Right sidebar presentation | `partial` | Functionally present as a focused detail area, but not a literal sidebar panel. |

### MAST classifier

| Requirement | Status | Notes |
| --- | --- | --- |
| Run classification on completed traces | `done` | Implemented in collector persistence flow. |
| `missing_error_handling` | `missing` | Not implemented. |
| `ambiguous_task_description` | `missing` | Not implemented. |
| `incorrect_agent_assignment` | `missing` | Not implemented. |
| `unverified_information_propagation` | `missing` | Not implemented. |
| `context_window_overflow` | `missing` | Not implemented. |
| `conflicting_instructions` | `missing` | Not implemented. |
| `premature_task_termination` | `missing` | Not implemented. |
| `agent_communication_failure` | `done` | Implemented. |
| `incorrect_termination_condition` | `missing` | Not implemented. |
| `infinite_loop_risk` | `done` | First deterministic version implemented. |
| `missing_output_validation` | `done` | Implemented. |
| `hallucinated_tool_result` | `missing` | Not implemented. |
| `cost_overrun` | `done` | Implemented with project thresholds. |
| `timeout_exceeded` | `done` | Implemented with project thresholds. |
| Severity tagging benign vs fatal | `partial` | Implemented for current rules, but not validated across full taxonomy. |
| Attach failures to relevant agent span/trace | `partial` | Available at trace and agent detail level; span-level attachment is not fully formalized. |

### Project settings

| Requirement | Status | Notes |
| --- | --- | --- |
| `/settings` route | `done` | Implemented. |
| API key display | `partial` | Project settings include API key, but full masked/copy/regenerate UX is not complete. |
| Adapter installation instructions | `partial` | Some settings UI exists, but full copy-paste install blocks are not complete. |
| Retention settings | `done` | Implemented. |
| Delete project flow | `missing` | Not implemented. |

## Phase 2: Debugging primitives

### Replay

| Requirement | Status | Notes |
| --- | --- | --- |
| Replay entry button | `done` | Implemented. |
| Step forward | `done` | Implemented. |
| Step back | `done` | Implemented. |
| Replay dimming / activation state | `done` | Implemented. |
| Scrubber | `done` | Implemented. |
| Fork here modal | `done` | Implemented. |
| Persist fork drafts | `done` | Implemented. |
| Re-submit to live agent | `missing` | Not implemented. |

### Causal attribution

| Requirement | Status | Notes |
| --- | --- | --- |
| Walk graph backwards from failure | `partial` | First backend pass exists. |
| Identify root-cause agent | `partial` | Implemented heuristically, not deeply validated. |
| `root_cause: true` in graph node data | `done` | Implemented. |
| Root-cause visual treatment | `done` | Implemented. |
| Plain-English causal chain explanation | `done` | Implemented. |

### Decision reasoning trace

| Requirement | Status | Notes |
| --- | --- | --- |
| SDK `capture_decision` API | `missing` | Not implemented to spec. |
| Automatic adapter capture | `missing` | Not implemented. |
| Full prompt/conversation/tools/action/reasoning render | `partial` | UI can render decision context payloads if present, but the automatic capture pipeline is not done. |

### A2A tracing

| Requirement | Status | Notes |
| --- | --- | --- |
| A2A adapter | `missing` | Not implemented. |
| A2A attributes / metadata propagation | `missing` | Not implemented. |
| A2A graph rendering | `missing` | Not implemented. |

### AG-UI tracing

| Requirement | Status | Notes |
| --- | --- | --- |
| AG-UI adapter | `missing` | Not implemented. |
| Event-to-span mapping | `missing` | Not implemented. |
| Timeline rendering | `missing` | Not implemented. |

### Critical path analysis

| Requirement | Status | Notes |
| --- | --- | --- |
| API critical path response | `missing` | Not implemented. |
| UI critical path highlight/toggle | `missing` | Not implemented. |
| Bottleneck badge | `missing` | Not implemented. |

## README and launch-readiness

| Requirement | Status | Notes |
| --- | --- | --- |
| One-line description | `done` | Present in README. |
| Screenshot or GIF | `missing` | Not present. |
| Badges | `missing` | Not present. |
| 5-minute CrewAI quickstart | `partial` | Generic quickstart exists; CrewAI-specific flow is not complete. |
| Self-host instructions | `partial` | Basic Docker instructions exist. |
| Framework support table | `missing` | Not present. |
| "What Rifft does not do" section | `done` | Present. |
| Docs link | `missing` | Not present. |
| Contributing guide link | `missing` | Not present. |

## Definition of done status

### Phase 1 public launch

| Requirement | Status | Notes |
| --- | --- | --- |
| `docker compose up` under 2 minutes on clean machine | `partial` | Works locally, but not benchmarked/verified as a clean-machine claim. |
| CrewAI trace visible in UI | `partial` | Sample CrewAI-shaped traces are visible; real adapter-driven CrewAI validation still needed. |
| AutoGen GroupChat visible in UI | `missing` | Not validated. |
| Graph works for both frameworks in one view | `missing` | Not validated. |
| 8 of 14 MAST failures firing | `missing` | 5 deterministic rules implemented. |
| Per-agent cost/duration within 5% | `partial` | Present, but not formally validated against actual API costs. |
| Agent detail panel shows full message history and tool calls | `done` | Implemented. |
| README quickstart tested on clean machine | `missing` | Not validated. |
| No console errors in Chrome/Firefox | `missing` | Not validated. |
| API endpoints under 500ms for 1000-span traces | `missing` | Not benchmarked. |

### Phase 2 cloud launch

| Requirement | Status | Notes |
| --- | --- | --- |
| Step-through replay works for recorded traces | `partial` | UI replay exists and works on current traces; broader validation still needed. |
| Fork-and-resubmit works for CrewAI | `missing` | Draft persistence exists, resubmission does not. |
| Causal attribution correctly identifies root cause | `partial` | First pass exists, not comprehensively validated. |
| Decision context captured automatically | `missing` | Not implemented. |
| A2A and AG-UI rendering | `missing` | Not implemented. |
| Critical path calculated and highlighted | `missing` | Not implemented. |
| Cloud sign-up and onboarding | `missing` | Not implemented. |
| Free tier span limit | `missing` | Not implemented. |
| Supabase auth for cloud accounts | `missing` | Not implemented. |
| `rifft.dev` serves product site | `missing` | Not implemented. |

## Recommended next build order

1. Finish the instrumentation layer: Python SDK, JS SDK, CrewAI adapter, AutoGen adapter, MCP adapter.
2. Expand MAST coverage from 5 rules to at least 8, then toward the full 14.
3. Upgrade trace detail to the final Phase 1 shape: React Flow, fuller filters, polished settings/install flows.
4. Implement real fork-and-resubmit and automatic decision-context capture.
5. Add critical path, A2A, and AG-UI support.
6. Finish README, docs, clean-machine quickstart testing, browser QA, and performance validation.

Free50K/month $0
Pro500K/month$49/month 
Scale2M/month$149/month
EnterpriseUnlimited$500+/month

The Polar integration
