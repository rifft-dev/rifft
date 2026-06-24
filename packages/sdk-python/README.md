# rifft-sdk

Python SDK for [Rifft](https://github.com/rifft-dev/rifft), a cross-framework debugger for multi-agent AI systems.

`rifft-sdk` lets you instrument Python agents, spans, handoffs, tool calls, and decisions, then view the resulting trace in Rifft with communication graphs, timelines, replay, and MAST failure classification.

## Install

```bash
pip install rifft-sdk
```

Add the optional adapter for your framework:

```bash
pip install rifft-sdk rifft-langgraph   # LangGraph
pip install rifft-sdk rifft-crewai      # CrewAI
pip install rifft-sdk rifft-autogen     # AutoGen / AG2
pip install rifft-sdk rifft-mcp         # MCP
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
- installed adapters like `rifft-langgraph`, `rifft-crewai`, `rifft-autogen`, and `rifft-mcp` auto-instrument on init

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

## Claude Code Integration

Automatically trace every Claude Code session — every tool call, timing, and error — without changing your workflow.

```bash
pip install rifft-sdk
rifft-claude init --project-id YOUR_PROJECT_ID --api-key YOUR_API_KEY
```

`rifft-claude init` registers hooks in `~/.claude/settings.json`. From then on, every Claude Code session sends a trace to Rifft when it ends: one root `claude-code.session` span with a child span per tool call (Bash, Read, Edit, Write, Task, and so on).

**What you'll see in Rifft:**
- Full tool call sequence with timing
- Errors surfaced automatically (failed Bash commands, missing files)
- MAST classification applied to the session (tool loops, hallucinated tool calls)
- Traces appear the moment a session ends — no code changes needed

Check your setup:

```bash
rifft-claude status
```

Credentials are stored in `~/.rifft/config.json` (chmod 600). You can also use env vars:

```bash
export RIFFT_PROJECT_ID=your_project_id
export RIFFT_API_KEY=rft_live_xxxxxxxxxxxx
```

## What You Get

- trace capture for Python multi-agent workflows
- agent and tool spans with timing and cost metadata
- communication edges and handoff visibility
- Claude Code session tracing with zero code changes
- compatibility with Rifft adapters: LangGraph, CrewAI, AutoGen, and MCP

## Links

- Repository: https://github.com/rifft-dev/rifft
- Issues: https://github.com/rifft-dev/rifft/issues
