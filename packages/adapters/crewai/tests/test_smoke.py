from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

SDK_SRC = Path(__file__).resolve().parents[3] / "sdk-python" / "src"
ADAPTER_SRC = Path(__file__).resolve().parents[1] / "src"

for path in (str(SDK_SRC), str(ADAPTER_SRC)):
    if path not in sys.path:
        sys.path.insert(0, path)


def install_fake_opentelemetry() -> None:
    if "opentelemetry" in sys.modules:
        return

    trace_api = types.ModuleType("opentelemetry.trace")

    class _StatusCode:
        ERROR = "error"

    class _Status:
        def __init__(self, code: object, description: str | None = None) -> None:
            self.code = code
            self.description = description

    class _SpanKind:
        INTERNAL = "internal"

    class _NoopTracer:
        def start_as_current_span(self, name: str, kind=None):
            class _Manager:
                def __enter__(self):
                    return object()

                def __exit__(self, exc_type, exc, tb):
                    return None

            return _Manager()

    trace_api.Status = _Status
    trace_api.StatusCode = _StatusCode
    trace_api.SpanKind = _SpanKind
    trace_api.set_tracer_provider = lambda provider: None
    trace_api.get_tracer = lambda *args, **kwargs: _NoopTracer()

    exporter_module = types.ModuleType("opentelemetry.exporter.otlp.proto.http.trace_exporter")

    class _OTLPSpanExporter:
        def __init__(self, *args, **kwargs) -> None:
            pass

    exporter_module.OTLPSpanExporter = _OTLPSpanExporter

    resources_module = types.ModuleType("opentelemetry.sdk.resources")

    class _Resource:
        @staticmethod
        def create(attributes):
            return attributes

    resources_module.Resource = _Resource

    sdk_trace_module = types.ModuleType("opentelemetry.sdk.trace")

    class _ReadableSpan:
        pass

    class _TracerProvider:
        def __init__(self, resource=None) -> None:
            self.resource = resource
            self.processors = []

        def add_span_processor(self, processor) -> None:
            self.processors.append(processor)

    sdk_trace_module.ReadableSpan = _ReadableSpan
    sdk_trace_module.TracerProvider = _TracerProvider

    export_module = types.ModuleType("opentelemetry.sdk.trace.export")

    class _SpanExporter:
        pass

    class _SpanExportResult:
        SUCCESS = "success"
        FAILURE = "failure"

    class _BatchSpanProcessor:
        def __init__(self, exporter) -> None:
            self.exporter = exporter

    export_module.SpanExporter = _SpanExporter
    export_module.SpanExportResult = _SpanExportResult
    export_module.BatchSpanProcessor = _BatchSpanProcessor

    opentelemetry_module = types.ModuleType("opentelemetry")
    opentelemetry_module.trace = trace_api

    sys.modules["opentelemetry"] = opentelemetry_module
    sys.modules["opentelemetry.trace"] = trace_api
    sys.modules["opentelemetry.exporter.otlp.proto.http.trace_exporter"] = exporter_module
    sys.modules["opentelemetry.sdk.resources"] = resources_module
    sys.modules["opentelemetry.sdk.trace"] = sdk_trace_module
    sys.modules["opentelemetry.sdk.trace.export"] = export_module


install_fake_opentelemetry()

import rifft

ACTIVE_AGENT_IDS: list[str] = []


class RecordingSpan:
    def __init__(self, name: str, agent_id: str, framework: str) -> None:
        self.name = name
        self.agent_id = agent_id
        self.framework = framework
        self.attributes: dict[str, object] = {}

    def __enter__(self) -> "RecordingSpan":
        ACTIVE_AGENT_IDS.append(self.agent_id)
        RECORDED_SPANS.append(self)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        ACTIVE_AGENT_IDS.pop()
        return None

    def set_attribute(self, key: str, value: object) -> None:
        self.attributes[key] = value


RECORDED_SPANS: list[RecordingSpan] = []


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
        self.tool.run(task.description)
        return f"{self.role}:{task.description}"


class FakeCrew:
    def __init__(self, agents, tasks, name: str = "demo-crew") -> None:
        self.agents = agents
        self.tasks = tasks
        self.name = name

    def kickoff(self) -> list[str]:
        outputs = []
        for agent, task in zip(self.agents, self.tasks):
            outputs.append(agent.execute_task(task))
        return outputs


class CrewAiAdapterSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        RECORDED_SPANS.clear()
        ACTIVE_AGENT_IDS.clear()
        self.module_patcher = self._install_fake_crewai_modules()
        self.module_patcher.start()
        self.span_patcher = mock.patch.object(
            rifft,
            "span",
            side_effect=lambda name, *, agent_id, framework="custom": RecordingSpan(name, agent_id, framework),
        )
        self.current_agent_patcher = mock.patch.object(
            rifft,
            "get_current_agent_id",
            side_effect=lambda: ACTIVE_AGENT_IDS[-1] if ACTIVE_AGENT_IDS else None,
        )
        self.span_patcher.start()
        self.current_agent_patcher.start()
        sys.modules.pop("rifft.adapters.crewai", None)
        importlib.import_module("rifft.adapters.crewai")

    def tearDown(self) -> None:
        self.span_patcher.stop()
        self.current_agent_patcher.stop()
        self.module_patcher.stop()
        sys.modules.pop("rifft.adapters.crewai", None)
        sys.modules.pop("crewai", None)
        sys.modules.pop("crewai.tools", None)

    def _install_fake_crewai_modules(self):
        crewai_module = types.ModuleType("crewai")
        crewai_module.Agent = FakeAgent
        crewai_module.Crew = FakeCrew

        tools_module = types.ModuleType("crewai.tools")
        tools_module.BaseTool = FakeTool

        return mock.patch.dict(
            sys.modules,
            {
                "crewai": crewai_module,
                "crewai.tools": tools_module,
            },
        )

    def test_one_line_import_instruments_crew_agent_and_tool_calls(self) -> None:
        agents = [
            FakeAgent(role="researcher", goal="Find sources"),
            FakeAgent(role="writer", goal="Draft answer"),
        ]
        tasks = [
            FakeTask("Search ClickHouse docs"),
            FakeTask("Write summary"),
        ]
        crew = FakeCrew(agents=agents, tasks=tasks)

        result = crew.kickoff()

        self.assertEqual(result, ["researcher:Search ClickHouse docs", "writer:Write summary"])
        names = [span.name for span in RECORDED_SPANS]
        self.assertIn("crew.kickoff", names)
        self.assertIn("agent.execute", names)
        self.assertIn("tool.call", names)
        self.assertIn("rifft.agent_to_agent", names)

        kickoff_span = next(span for span in RECORDED_SPANS if span.name == "crew.kickoff")
        self.assertEqual(kickoff_span.framework, "crewai")
        self.assertEqual(kickoff_span.attributes["crewai.agent_count"], 2)

        tool_span = next(span for span in RECORDED_SPANS if span.name == "tool.call")
        self.assertEqual(tool_span.agent_id, "researcher")
        self.assertEqual(tool_span.attributes["tool.name"], "web_search")
        self.assertIn("Search ClickHouse docs", str(tool_span.attributes["tool.input"]))

        communication_span = next(span for span in RECORDED_SPANS if span.name == "rifft.agent_to_agent")
        self.assertEqual(communication_span.agent_id, "researcher")
        self.assertEqual(communication_span.attributes["source_agent_id"], "researcher")
        self.assertEqual(communication_span.attributes["target_agent_id"], "writer")
        self.assertIn("researcher:Search ClickHouse docs", str(communication_span.attributes["message"]))


if __name__ == "__main__":
    unittest.main()
