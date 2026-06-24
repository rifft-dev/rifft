# rifft-langgraph

LangGraph adapter for [Rifft](https://rifft.dev). Zero-config tracing for LangGraph multi-agent pipelines — one import captures every node execution, inter-node handoff, and the full graph run.

## Install

```bash
pip install rifft-sdk rifft-langgraph
```

## Usage

Import the adapter anywhere before building your graph:

```python
import rifft
import rifft.adapters.langgraph  # instruments StateGraph automatically

rifft.init(project_id="my-project", endpoint="http://localhost:4318")

from langgraph.graph import StateGraph, END
from typing import TypedDict

class State(TypedDict):
    query: str
    research: str
    output: str

def researcher(state: State) -> dict:
    return {"research": "..."}

def writer(state: State) -> dict:
    return {"output": "..."}

graph = StateGraph(State)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)
graph.add_edge("researcher", "writer")
graph.set_entry_point("researcher")

app = graph.compile()
result = app.invoke({"query": "what is rifft?"})
# Open http://localhost:3000 to see the trace
```

## What gets traced

| Event | Rifft span |
|---|---|
| `graph.invoke()` / `graph.ainvoke()` | `langgraph.graph.invoke` |
| Each node execution | `agent.execute` with `langgraph.node`, input/output state |
| Node A → Node B handoff | `rifft.agent_to_agent` with `source_agent_id`, `target_agent_id`, state payload |
