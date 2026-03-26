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
        OK = "ok"
        ERROR = "error"

    class _Status:
        def __init__(self, code: object, description: str | None = None) -> None:
            self.code = code
            self.description = description

    class _SpanKind:
        INTERNAL = "internal"

    class _NoopContext:
        trace_id = 0
        span_id = 0

    class _NoopCurrentSpan:
        def get_span_context(self):
            return _NoopContext()

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
    trace_api.get_current_span = lambda: _NoopCurrentSpan()

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
    sys.modules["opentelemetry.sdk.resources"] = resources_module
    sys.modules["opentelemetry.sdk.trace"] = sdk_trace_module
    sys.modules["opentelemetry.sdk.trace.export"] = export_module


install_fake_opentelemetry()

import rifft

RECORDED_SPANS: list["RecordingSpan"] = []


class RecordingSpan:
    def __init__(self, name: str, agent_id: str, framework: str) -> None:
        self.name = name
        self.agent_id = agent_id
        self.framework = framework
        self.attributes: dict[str, object] = {}

    def __enter__(self) -> "RecordingSpan":
        RECORDED_SPANS.append(self)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def set_attribute(self, key: str, value: object) -> None:
        self.attributes[key] = value


class FakeClientSession:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def call_tool(self, name: str, arguments: dict[str, object] | None = None, **kwargs):
        self.calls.append(
            {
                "name": name,
                "arguments": arguments,
                "kwargs": kwargs,
            }
        )
        return {"content": [{"type": "text", "text": "ok"}], "structuredContent": {"hits": 2}}


class McpAdapterSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        RECORDED_SPANS.clear()
        self.module_patcher = self._install_fake_mcp_modules()
        self.module_patcher.start()
        self.span_patcher = mock.patch.object(
            rifft,
            "span",
            side_effect=lambda name, *, agent_id, framework="custom": RecordingSpan(name, agent_id, framework),
        )
        self.agent_patcher = mock.patch.object(rifft, "get_current_agent_id", return_value="researcher")
        self.context_patcher = mock.patch.object(
            rifft,
            "get_current_trace_context",
            return_value={"trace_id": "1" * 32, "span_id": "2" * 16},
        )
        self.span_patcher.start()
        self.agent_patcher.start()
        self.context_patcher.start()
        sys.modules.pop("rifft.adapters.mcp", None)
        importlib.import_module("rifft.adapters.mcp")

    def tearDown(self) -> None:
        self.span_patcher.stop()
        self.agent_patcher.stop()
        self.context_patcher.stop()
        self.module_patcher.stop()
        sys.modules.pop("rifft.adapters.mcp", None)
        sys.modules.pop("mcp", None)
        sys.modules.pop("mcp.client", None)
        sys.modules.pop("mcp.client.session", None)

    def _install_fake_mcp_modules(self):
        mcp_module = types.ModuleType("mcp")
        mcp_module.ClientSession = FakeClientSession

        client_module = types.ModuleType("mcp.client")
        session_module = types.ModuleType("mcp.client.session")
        session_module.ClientSession = FakeClientSession

        return mock.patch.dict(
            sys.modules,
            {
                "mcp": mcp_module,
                "mcp.client": client_module,
                "mcp.client.session": session_module,
            },
        )

    def test_one_line_import_instruments_call_tool_and_injects_trace_headers(self) -> None:
        client = FakeClientSession()
        result = client.call_tool("search_docs", {"query": "trace graph"})

        self.assertEqual(result["structuredContent"]["hits"], 2)
        self.assertEqual(len(RECORDED_SPANS), 1)

        span = RECORDED_SPANS[0]
        self.assertEqual(span.name, "tool.call")
        self.assertEqual(span.agent_id, "researcher")
        self.assertEqual(span.framework, "custom")
        self.assertEqual(span.attributes["tool.name"], "search_docs")
        self.assertEqual(span.attributes["mcp.tool_name"], "search_docs")
        self.assertEqual(span.attributes["mcp.server_name"], "mcp-server")
        self.assertIn("trace graph", str(span.attributes["mcp.input"]))
        self.assertIn("structuredContent", str(span.attributes["mcp.output"]))

        call = client.calls[0]
        headers = call["kwargs"]["headers"]
        self.assertEqual(headers["traceparent"], "00-11111111111111111111111111111111-2222222222222222-01")
        self.assertEqual(headers["x-rifft-traceparent"], "00-11111111111111111111111111111111-2222222222222222-01")


if __name__ == "__main__":
    unittest.main()
