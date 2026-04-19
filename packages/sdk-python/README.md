# rifft-sdk

Python SDK for [Rifft](https://github.com/rifft-dev/rifft), a cross-framework debugger for multi-agent AI systems.

`rifft-sdk` lets you instrument Python agents, spans, handoffs, tool calls, and decisions, then view the resulting trace in Rifft with communication graphs, timelines, replay, and MAST failure classification.

## Install

```bash
pip install rifft-sdk
```

Add the optional adapter for your framework:

```bash
pip install rifft-sdk rifft-crewai
```

## Quickstart

```python
import rifft

rifft.init()

@rifft.trace(agent_id="researcher", framework="custom")
def run_research():
    with rifft.span("tool.call", agent_id="researcher"):
        return {"summary": "Agent trace debugging helps teams inspect handoffs."}

run_research()
```

`rifft.init()` now works with sensible defaults:

- `project_id="default"`
- `endpoint="http://localhost:4318"`
- `service_name` inferred from your current directory
- installed adapters like `rifft-crewai`, `rifft-autogen`, and `rifft-mcp` auto-instrument on init

For hosted cloud projects, pass the project credentials directly or set env vars:

```python
import rifft

rifft.init(
    project_id="proj_your_project_id",
    endpoint="https://ingest.rifft.dev",
    api_key="rft_live_xxxxxxxxxxxx",
)
```

Supported env vars:

- `RIFFT_PROJECT_ID`
- `RIFFT_ENDPOINT`
- `RIFFT_API_KEY`
- `RIFFT_SERVICE_NAME`

## What You Get

- trace capture for Python multi-agent workflows
- agent and tool spans with timing and cost metadata
- communication edges and handoff visibility
- compatibility with Rifft adapters such as CrewAI, AutoGen, and MCP

## Links

- Repository: https://github.com/rifft-dev/rifft
- Issues: https://github.com/rifft-dev/rifft/issues
