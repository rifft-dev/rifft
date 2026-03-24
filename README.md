# Rifft

Rifft — cross-framework debugger for multi-agent AI systems.

[![npm version](https://img.shields.io/badge/npm-0.1.0-red)](https://www.npmjs.com/package/rifft)
[![PyPI version](https://img.shields.io/badge/PyPI-0.1.0-blue)](https://pypi.org/project/rifft/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](/Users/ned/Documents/GitHub/Rifft/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/nedbpowell/rifft?style=social)](https://github.com/nedbpowell/rifft)

Rifft helps developers debug multi-agent AI systems by making agent decisions, message flow, tool calls, and failure cascades visible across frameworks. It is intentionally opinionated: Rifft is for debugging multi-agent behavior, not for generic LLM observability.

## Screenshot

Add a real communication-graph screenshot or GIF here before public launch.

## What Rifft does

- Cross-framework trace ingestion for multi-agent runs
- Agent-to-agent graph visualization
- Timeline and per-agent debugging views
- MAST failure classification
- Self-hosted deployment with Docker Compose

## What Rifft does not do

- Prompt management UI
- LLM evaluation or scoring
- AI gateway or proxy features
- General APM or application monitoring
- Single-LLM call tracing as the primary feature

## Framework support

| Framework | Status |
| --- | --- |
| CrewAI | Full |
| AutoGen / AG2 | Full |
| MCP | Full |
| LangGraph | Planned |
| Custom agents via SDK | Full |

## 5-minute CrewAI quickstart

```python
pip install rifft rifft-crewai
```

```python
import rifft
import rifft.adapters.crewai

rifft.init(project_id="my-project", endpoint="http://localhost:4318")

# Your existing crew code unchanged
crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()
# Open http://localhost:3000 to see the trace
```

## Self-host in under 5 minutes

```bash
git clone https://github.com/nedbpowell/rifft.git
cd rifft
cp .env.example .env
docker compose up -d --build
open http://localhost:3000
```

Default local endpoints:

- Web UI: `http://localhost:3000`
- API: `http://localhost:4000`
- Collector HTTP: `http://localhost:4318`
- Collector gRPC placeholder: `localhost:4317`

## Monorepo layout

```text
rifft/
├── apps/
│   ├── api
│   └── web
├── infra/
│   └── docker
├── packages/
│   ├── adapters/
│   │   ├── autogen
│   │   ├── crewai
│   │   └── mcp
│   ├── collector
│   ├── sdk-js
│   └── sdk-python
└── docs/
```

## Developer notes

- Copy `.env.example` to `.env` for local development.
- Current implementation tracker: [docs/implementation-tracker.md](/Users/ned/Documents/GitHub/Rifft/docs/implementation-tracker.md)
- Current Phase 0/1 plan: [docs/phase-0-1-plan.md](/Users/ned/Documents/GitHub/Rifft/docs/phase-0-1-plan.md)
- Use [scripts/cleanup-demo-traces.sh](/Users/ned/Documents/GitHub/Rifft/scripts/cleanup-demo-traces.sh) to remove stale pre-fix demo traces from local storage.

## Docs

- Architecture notes: [docs/architecture.md](/Users/ned/Documents/GitHub/Rifft/docs/architecture.md)
- Docs/wiki placeholder: [GitHub Wiki](https://github.com/nedbpowell/rifft/wiki)
- Contributing: [CONTRIBUTING.md](/Users/ned/Documents/GitHub/Rifft/CONTRIBUTING.md)

## License

MIT
