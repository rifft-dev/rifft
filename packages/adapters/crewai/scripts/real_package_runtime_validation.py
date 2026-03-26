from __future__ import annotations

import importlib
import json
import os
from typing import Any

os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")

import crewai.agent.core as agent_core
import crewai.memory.storage.kickoff_task_outputs_storage as storage_mod
import crewai.utilities.llm_utils as llm_utils
import rifft
from crewai import Agent, Crew, Task
from crewai.tools import BaseTool


class EchoTool(BaseTool):
    name: str = "echo_tool"
    description: str = "Echoes the task description for adapter validation."

    def _run(self, query: str) -> str:
        return f"echo:{query}"


def _disable_crewai_llm_fallback() -> None:
    llm_utils.create_llm = lambda value=None: None
    agent_core.create_llm = lambda value=None: None


def _disable_crewai_storage() -> None:
    def storage_init(self: Any, db_path: str | None = None) -> None:
        self.db_path = db_path or "/tmp/rifft-crewai-runtime-validation.db"
        self._lock_name = f"sqlite:{self.db_path}"
        self._printer = None

    storage_mod.KickoffTaskOutputsSQLiteStorage.__init__ = storage_init
    storage_mod.KickoffTaskOutputsSQLiteStorage.add = lambda self, *args, **kwargs: None
    storage_mod.KickoffTaskOutputsSQLiteStorage.update = lambda self, *args, **kwargs: None
    storage_mod.KickoffTaskOutputsSQLiteStorage.load = lambda self: []
    storage_mod.KickoffTaskOutputsSQLiteStorage.delete_all = lambda self: None


def _install_local_runtime_methods() -> None:
    def execute_task(self: Agent, task: Task, context: str | None = None, tools: list[BaseTool] | None = None) -> str:
        toolset = tools or getattr(self, "tools", None) or []
        tool_result = toolset[0].run(task.description) if toolset else task.description
        return f"{self.role}:{tool_result}"

    def kickoff(self: Crew, inputs: dict[str, Any] | None = None, input_files: dict[str, Any] | None = None) -> list[str]:
        outputs: list[str] = []
        for task in self.tasks:
            outputs.append(task.agent.execute_task(task, tools=getattr(task.agent, "tools", None)))
        return outputs

    Agent.execute_task = execute_task
    Crew.kickoff = kickoff


def main() -> None:
    _disable_crewai_llm_fallback()
    _disable_crewai_storage()
    _install_local_runtime_methods()

    rifft.init(
        project_id=os.getenv("RIFFT_PROJECT_ID", "default"),
        endpoint=os.getenv("RIFFT_ENDPOINT", "http://localhost:4318"),
    )

    importlib.import_module("rifft.adapters.crewai")

    researcher = Agent(
        role="researcher",
        goal="Investigate the runtime validation path",
        backstory="A local validation agent.",
        tools=[EchoTool()],
        llm=None,
    )
    writer = Agent(
        role="writer",
        goal="Summarise the runtime validation path",
        backstory="A local validation agent.",
        tools=[EchoTool()],
        llm=None,
    )
    tasks = [
        Task(
            description="Find two useful facts about runtime validation.",
            expected_output="A short fact list.",
            agent=researcher,
        ),
        Task(
            description="Write a concise summary using the validated facts.",
            expected_output="A short engineering summary.",
            agent=writer,
        ),
    ]
    crew = Crew(name="rifft-real-crewai-runtime-validation", agents=[researcher, writer], tasks=tasks)

    with rifft.span("real.crewai.runtime.validation", agent_id="orchestrator", framework="crewai") as span:
        outputs = crew.kickoff()
        span.set_attribute("validation.output_count", len(outputs))
        span.set_attribute("validation.outputs", outputs)

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    print(
        json.dumps(
            {
                "framework": "crewai",
                "crew_wrapped": bool(getattr(Crew.kickoff, "__rifft_wrapped__", False)),
                "agent_wrapped": bool(getattr(Agent.execute_task, "__rifft_wrapped__", False)),
                "tool_wrapped": bool(getattr(BaseTool.run, "__rifft_wrapped__", False)),
                "output_count": len(outputs),
                "outputs": outputs,
            }
        )
    )


if __name__ == "__main__":
    main()
