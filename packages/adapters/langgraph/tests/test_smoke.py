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


# ---------------------------------------------------------------------------
# Fake LangGraph classes
# ---------------------------------------------------------------------------

class FakeCompiledGraph:
    """Minimal compiled-graph stand-in: runs nodes in add_node order."""

    name = "test-graph"

    def __init__(self, node_order: list[str], node_fns: dict[str, object]) -> None:
        self._node_order = node_order
        self._node_fns = node_fns

    def invoke(self, state: dict) -> dict:
        current = dict(state)
        for node_name in self._node_order:
            fn = self._node_fns[node_name]
            result = fn(current)
            if isinstance(result, dict):
                current = {**current, **result}
        return current


class FakeStateGraph:
    def __init__(self, state_type: object = None) -> None:
        self._nodes: dict[str, object] = {}
        self._node_order: list[str] = []

    def add_node(self, *args: object, **kwargs: object) -> None:
        if not args:
            return
        first = args[0]
        if isinstance(first, str) and len(args) >= 2:
            name, fn = str(first), args[1]
        elif callable(first):
            name, fn = getattr(first, "__name__", "node"), first
        else:
            return
        self._nodes[name] = fn
        if name not in self._node_order:
            self._node_order.append(name)

    def add_edge(self, src: str, dst: str) -> None:
        pass

    def set_entry_point(self, node_name: str) -> None:
        pass

    def compile(self) -> FakeCompiledGraph:
        return FakeCompiledGraph(list(self._node_order), dict(self._nodes))


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

class LangGraphAdapterSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        RECORDED_SPANS.clear()
        ACTIVE_AGENT_IDS.clear()
        self.module_patcher = self._install_fake_langgraph_modules()
        self.module_patcher.start()
        self.span_patcher = mock.patch.object(
            rifft,
            "span",
            side_effect=lambda name, *, agent_id, framework="custom": RecordingSpan(name, agent_id, framework),
        )
        self.span_patcher.start()
        sys.modules.pop("rifft.adapters.langgraph", None)
        importlib.import_module("rifft.adapters.langgraph")

    def tearDown(self) -> None:
        self.span_patcher.stop()
        self.module_patcher.stop()
        sys.modules.pop("rifft.adapters.langgraph", None)
        for key in list(sys.modules):
            if key.startswith("langgraph"):
                sys.modules.pop(key, None)

    def _install_fake_langgraph_modules(self) -> mock._patch:
        # Top-level langgraph package
        lg_pkg = types.ModuleType("langgraph")

        # langgraph.graph.state — where StateGraph and CompiledStateGraph live
        lg_graph_state = types.ModuleType("langgraph.graph.state")
        lg_graph_state.StateGraph = FakeStateGraph
        lg_graph_state.CompiledStateGraph = FakeCompiledGraph

        # langgraph.graph (intermediate)
        lg_graph = types.ModuleType("langgraph.graph")

        # langgraph.pregel — alternate location for the compiled class
        lg_pregel = types.ModuleType("langgraph.pregel")
        lg_pregel.Pregel = FakeCompiledGraph

        return mock.patch.dict(
            sys.modules,
            {
                "langgraph": lg_pkg,
                "langgraph.graph": lg_graph,
                "langgraph.graph.state": lg_graph_state,
                "langgraph.pregel": lg_pregel,
            },
        )

    # ------------------------------------------------------------------
    # Tests
    # ------------------------------------------------------------------

    def test_three_node_graph_emits_all_span_types(self) -> None:
        """invoke() on a 3-node graph should produce graph, execute, and handoff spans."""
        from langgraph.graph.state import StateGraph  # type: ignore

        def researcher(state: dict) -> dict:
            return {"research": "found docs"}

        def validator(state: dict) -> dict:
            return {"valid": True}

        def writer(state: dict) -> dict:
            return {"output": "final answer"}

        graph = StateGraph(dict)
        graph.add_node("researcher", researcher)
        graph.add_node("validator", validator)
        graph.add_node("writer", writer)
        graph.add_edge("researcher", "validator")
        graph.add_edge("validator", "writer")
        compiled = graph.compile()

        result = compiled.invoke({"query": "what is rifft?"})

        self.assertIn("output", result)

        span_names = [s.name for s in RECORDED_SPANS]

        # Root span
        self.assertIn("langgraph.graph.invoke", span_names)

        # One execute span per node
        execute_spans = [s for s in RECORDED_SPANS if s.name == "agent.execute"]
        self.assertEqual(len(execute_spans), 3)
        executed_agents = {s.agent_id for s in execute_spans}
        self.assertEqual(executed_agents, {"researcher", "validator", "writer"})

        # Two handoff spans: researcher→validator and validator→writer
        handoff_spans = [s for s in RECORDED_SPANS if s.name == "rifft.agent_to_agent"]
        self.assertEqual(len(handoff_spans), 2)

        first_handoff = handoff_spans[0]
        self.assertEqual(first_handoff.attributes["source_agent_id"], "researcher")
        self.assertEqual(first_handoff.attributes["target_agent_id"], "validator")
        self.assertEqual(first_handoff.attributes["protocol"], "agent_to_agent")
        self.assertEqual(first_handoff.framework, "langgraph")

        second_handoff = handoff_spans[1]
        self.assertEqual(second_handoff.attributes["source_agent_id"], "validator")
        self.assertEqual(second_handoff.attributes["target_agent_id"], "writer")

    def test_execute_spans_carry_node_name_and_state(self) -> None:
        """agent.execute spans must have langgraph.node and state attributes."""
        from langgraph.graph.state import StateGraph  # type: ignore

        def agent(state: dict) -> dict:
            return {"done": True}

        graph = StateGraph(dict)
        graph.add_node("agent", agent)
        compiled = graph.compile()
        compiled.invoke({"x": 1})

        execute_spans = [s for s in RECORDED_SPANS if s.name == "agent.execute"]
        self.assertEqual(len(execute_spans), 1)
        span = execute_spans[0]
        self.assertEqual(span.attributes["langgraph.node"], "agent")
        self.assertIn("langgraph.input_state", span.attributes)
        self.assertIn("langgraph.output_state", span.attributes)
        self.assertEqual(span.framework, "langgraph")

    def test_graph_invoke_span_carries_graph_name(self) -> None:
        from langgraph.graph.state import StateGraph  # type: ignore

        def noop(state: dict) -> dict:
            return {}

        graph = StateGraph(dict)
        graph.add_node("noop", noop)
        compiled = graph.compile()
        compiled.invoke({})

        graph_spans = [s for s in RECORDED_SPANS if s.name == "langgraph.graph.invoke"]
        self.assertEqual(len(graph_spans), 1)
        self.assertEqual(graph_spans[0].attributes.get("langgraph.graph_name"), "test-graph")

    def test_instrument_is_idempotent(self) -> None:
        """Calling instrument() a second time must not double-wrap."""
        from rifft.adapters.langgraph import instrument  # type: ignore
        result = instrument()
        self.assertTrue(result)

        from langgraph.graph.state import StateGraph  # type: ignore

        def agent(state: dict) -> dict:
            return {}

        graph = StateGraph(dict)
        graph.add_node("agent", agent)
        compiled = graph.compile()
        compiled.invoke({})

        execute_spans = [s for s in RECORDED_SPANS if s.name == "agent.execute"]
        self.assertEqual(len(execute_spans), 1, "double-wrapping would emit duplicate spans")

    def test_add_node_with_callable_only(self) -> None:
        """add_node(fn) with no name string must use fn.__name__ as agent_id."""
        from langgraph.graph.state import StateGraph  # type: ignore

        def planner(state: dict) -> dict:
            return {"plan": "step 1"}

        graph = StateGraph(dict)
        graph.add_node(planner)  # no explicit name
        compiled = graph.compile()
        compiled.invoke({})

        execute_spans = [s for s in RECORDED_SPANS if s.name == "agent.execute"]
        self.assertEqual(len(execute_spans), 1)
        self.assertEqual(execute_spans[0].agent_id, "planner")

    def test_independent_runs_do_not_bleed_context(self) -> None:
        """Two sequential invoke() calls must not carry over node state."""
        from langgraph.graph.state import StateGraph  # type: ignore

        def alpha(state: dict) -> dict:
            return {}

        def beta(state: dict) -> dict:
            return {}

        graph = StateGraph(dict)
        graph.add_node("alpha", alpha)
        compiled = graph.compile()

        compiled.invoke({})
        RECORDED_SPANS.clear()

        # Second run — beta is a different graph, alpha should not appear as prev
        graph2 = StateGraph(dict)
        graph2.add_node("beta", beta)
        compiled2 = graph2.compile()
        compiled2.invoke({})

        handoff_spans = [s for s in RECORDED_SPANS if s.name == "rifft.agent_to_agent"]
        self.assertEqual(len(handoff_spans), 0, "no handoffs across independent runs")


if __name__ == "__main__":
    unittest.main()
