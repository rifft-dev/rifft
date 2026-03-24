from __future__ import annotations

import importlib
import sys
import types
import uuid

import rifft


class FakeTask:
    def __init__(self, description: str) -> None:
        self.description = description


class FakeTool:
    name = "web_search"

    def run(self, query: str) -> dict[str, object]:
        return {"query": query, "hits": 3}


class FakeAgent:
    def __init__(self, role: str, goal: str) -> None:
        self.role = role
        self.goal = goal
        self.tool = FakeTool()

    def execute_task(self, task: FakeTask) -> str:
        result = self.tool.run(task.description)
        return f"{self.role}:{task.description}:{result['hits']}"


class FakeCrew:
    def __init__(self, agents, tasks, name: str = "python-crewai-adapter-smoke") -> None:
        self.agents = agents
        self.tasks = tasks
        self.name = name

    def kickoff(self) -> list[str]:
        outputs = []
        for agent, task in zip(self.agents, self.tasks):
            outputs.append(agent.execute_task(task))
        return outputs


def install_fake_crewai() -> None:
    crewai_module = types.ModuleType("crewai")
    crewai_module.Agent = FakeAgent
    crewai_module.Crew = FakeCrew

    tools_module = types.ModuleType("crewai.tools")
    tools_module.BaseTool = FakeTool

    sys.modules["crewai"] = crewai_module
    sys.modules["crewai.tools"] = tools_module


def main() -> None:
    test_id = f"crewai-adapter-smoke-{uuid.uuid4().hex[:12]}"
    install_fake_crewai()

    rifft.init(project_id="default", endpoint="http://localhost:4318")
    importlib.import_module("rifft.adapters.crewai")

    agents = [
        FakeAgent(role="researcher", goal=f"Investigate {test_id}"),
        FakeAgent(role="writer", goal=f"Summarise {test_id}"),
    ]
    tasks = [
        FakeTask(f"Research ClickHouse tracing patterns for {test_id} and capture 3 useful findings"),
        FakeTask(f"Write a concise engineering summary for {test_id} using the researched findings"),
    ]

    with rifft.span("adapter.smoke.root", agent_id="orchestrator", framework="crewai") as span:
        span.set_attribute("trace.test_id", test_id)
        crew = FakeCrew(agents=agents, tasks=tasks)
        outputs = crew.kickoff()
        span.set_attribute("trace.result", outputs)

    with rifft.span("output.validate", agent_id="orchestrator", framework="crewai") as span:
        span.set_attribute("validation.passed", len(outputs) == 2)
        span.set_attribute("validation.output", outputs)

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    print(test_id)


if __name__ == "__main__":
    main()
