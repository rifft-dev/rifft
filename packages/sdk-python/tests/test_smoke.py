from __future__ import annotations

import asyncio
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

SDK_SRC = Path(__file__).resolve().parents[1] / "src"
if str(SDK_SRC) not in sys.path:
    sys.path.insert(0, str(SDK_SRC))


def install_fake_opentelemetry() -> None:
    if "opentelemetry" in sys.modules:
        return

    trace_api = types.ModuleType("opentelemetry.trace")

    class _StatusCode:
        OK = "ok"
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
import rifft.core as core


class FakeSpan:
    def __init__(self) -> None:
        self.attributes: dict[str, object] = {}
        self.exceptions: list[BaseException] = []
        self.status = None

    def set_attribute(self, key: str, value: object) -> None:
        self.attributes[key] = value

    def record_exception(self, error: BaseException) -> None:
        self.exceptions.append(error)

    def set_status(self, status: object) -> None:
        self.status = status


class FakeSpanManager:
    def __init__(self, span: FakeSpan) -> None:
        self.span = span

    def __enter__(self) -> FakeSpan:
        return self.span

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class FakeTracer:
    def __init__(self, spans: list[FakeSpan]) -> None:
        self._spans = spans

    def start_as_current_span(self, name: str, kind=None) -> FakeSpanManager:
        span = FakeSpan()
        span.set_attribute("span.name", name)
        self._spans.append(span)
        return FakeSpanManager(span)


class PythonSdkSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        core._config = core._Config(project_id="smoke-project", endpoint="http://localhost:4318", api_key=None)
        self.recorded_spans: list[FakeSpan] = []
        self.get_tracer = mock.patch("rifft.core._get_tracer", return_value=FakeTracer(self.recorded_spans))
        self.get_tracer.start()

    def tearDown(self) -> None:
        self.get_tracer.stop()

    def test_span_context_records_attributes_and_decisions(self) -> None:
        with rifft.span("tool_call", agent_id="researcher", framework="crewai") as span:
            span.set_attribute("tool.name", "web_search")
            span.capture_decision(
                system_prompt="Be concise",
                conversation_history=["hello"],
                available_tools=["web_search"],
                chosen_action="web_search",
                reasoning="Need external context",
            )

        self.assertEqual(len(self.recorded_spans), 1)
        recorded = self.recorded_spans[0]
        self.assertEqual(recorded.attributes["agent_id"], "researcher")
        self.assertEqual(recorded.attributes["framework"], "crewai")
        self.assertEqual(recorded.attributes["tool.name"], "web_search")
        self.assertIn("rifft.decision", recorded.attributes)

    def test_trace_decorator_records_sync_function_details(self) -> None:
        @rifft.trace(agent_id="writer", framework="crewai")
        def draft_answer(topic: str) -> dict[str, str]:
            return {"topic": topic}

        result = draft_answer("clickhouse")

        self.assertEqual(result, {"topic": "clickhouse"})
        recorded = self.recorded_spans[0]
        self.assertEqual(recorded.attributes["code.function"], "draft_answer")
        self.assertEqual(recorded.attributes["rifft.return_type"], "dict")
        self.assertIn("clickhouse", str(recorded.attributes["rifft.function.args"]))

    def test_trace_decorator_records_async_function_details(self) -> None:
        @rifft.trace(agent_id="researcher", framework="crewai")
        async def collect_sources(query: str) -> list[str]:
            return [query, "docs"]

        result = asyncio.run(collect_sources("otlp"))

        self.assertEqual(result, ["otlp", "docs"])
        recorded = self.recorded_spans[0]
        self.assertEqual(recorded.attributes["code.function"], "collect_sources")
        self.assertEqual(recorded.attributes["rifft.return_type"], "list")

    def test_trace_decorator_records_exceptions(self) -> None:
        @rifft.trace(agent_id="planner")
        def fail() -> None:
            raise ValueError("boom")

        with self.assertRaises(ValueError):
            fail()

        recorded = self.recorded_spans[0]
        self.assertEqual(len(recorded.exceptions), 1)
        self.assertEqual(type(recorded.exceptions[0]).__name__, "ValueError")
        self.assertEqual(recorded.attributes["exception.type"], "ValueError")


if __name__ == "__main__":
    unittest.main()
