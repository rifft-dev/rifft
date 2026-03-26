# rifft-sdk

Python SDK for [Rifft](https://github.com/rifft-dev/rifft), a cross-framework debugger for multi-agent AI systems.

`rifft-sdk` lets you instrument Python agents, spans, handoffs, tool calls, and decisions, then view the resulting trace in Rifft with communication graphs, timelines, replay, and MAST failure classification.

## Install

```bash
pip install rifft-sdk
```

## Quickstart

```python
import rifft

rifft.init(service_name="my-agent-app")

@rifft.trace(agent_id="researcher", framework="custom")
def run_research():
    with rifft.span("tool.call"):
        return {"summary": "Agent trace debugging helps teams inspect handoffs."}

run_research()
```

By default, the SDK exports OTLP traces to the local Rifft collector.

## What You Get

- trace capture for Python multi-agent workflows
- agent and tool spans with timing and cost metadata
- communication edges and handoff visibility
- compatibility with Rifft adapters such as CrewAI, AutoGen, and MCP

## Links

- Repository: https://github.com/rifft-dev/rifft
- Issues: https://github.com/rifft-dev/rifft/issues
