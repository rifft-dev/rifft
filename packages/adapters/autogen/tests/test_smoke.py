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

ACTIVE_AGENT_IDS: list[str] = []
RECORDED_SPANS: list["RecordingSpan"] = []


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


class FakeConversableAgent:
    def __init__(self, name: str) -> None:
        self.name = name

    def send(self, message: object, recipient: "FakeConversableAgent") -> str:
        recipient.receive(message, self)
        return "sent"

    def receive(self, message: object, sender: "FakeConversableAgent" | None = None) -> str:
        return f"received:{self.name}:{sender.name if sender else 'none'}"


class FakeGroupChat:
    def __init__(self, agents: list[FakeConversableAgent]) -> None:
        self.agents = agents


class FakeGroupChatManager:
    def __init__(self, name: str, groupchat: FakeGroupChat) -> None:
        self.name = name
        self.groupchat = groupchat

    def run_chat(self) -> str:
        return "chat-run"


class AutoGenAdapterSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        RECORDED_SPANS.clear()
        ACTIVE_AGENT_IDS.clear()
        self.module_patcher = self._install_fake_autogen_modules()
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
        sys.modules.pop("rifft.adapters.autogen", None)
        importlib.import_module("rifft.adapters.autogen")

    def tearDown(self) -> None:
        self.span_patcher.stop()
        self.current_agent_patcher.stop()
        self.module_patcher.stop()
        sys.modules.pop("rifft.adapters.autogen", None)
        sys.modules.pop("autogen", None)

    def _install_fake_autogen_modules(self):
        autogen_module = types.ModuleType("autogen")
        autogen_module.ConversableAgent = FakeConversableAgent
        autogen_module.GroupChat = FakeGroupChat
        autogen_module.GroupChatManager = FakeGroupChatManager

        return mock.patch.dict(sys.modules, {"autogen": autogen_module})

    def test_one_line_import_instruments_send_receive_and_manager(self) -> None:
        planner = FakeConversableAgent("planner")
        writer = FakeConversableAgent("writer")
        manager = FakeGroupChatManager("manager", FakeGroupChat([planner, writer]))

        manager.run_chat()
        planner.send({"content": "Draft summary"}, writer)

        names = [span.name for span in RECORDED_SPANS]
        self.assertIn("autogen.groupchat.run", names)
        self.assertIn("autogen.message.send", names)
        self.assertIn("autogen.message.receive", names)

        send_span = next(span for span in RECORDED_SPANS if span.name == "autogen.message.send")
        self.assertEqual(send_span.agent_id, "planner")
        self.assertEqual(send_span.attributes["source_agent_id"], "planner")
        self.assertEqual(send_span.attributes["target_agent_id"], "writer")

        receive_span = next(span for span in RECORDED_SPANS if span.name == "autogen.message.receive")
        self.assertEqual(receive_span.agent_id, "writer")
        self.assertEqual(receive_span.attributes["autogen.sender_agent"], "planner")
        self.assertEqual(receive_span.attributes["autogen.receiver_agent"], "writer")


if __name__ == "__main__":
    unittest.main()
