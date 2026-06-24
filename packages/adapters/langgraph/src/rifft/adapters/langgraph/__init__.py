from __future__ import annotations

import contextvars
import inspect
import json
from typing import Any, Callable

import rifft

_INSTRUMENTED = False

# Tracks the name of the most-recently-started node within the current
# graph.invoke() call.  Set to None by the invoke wrapper at the start of
# each run; node wrappers SET it (without resetting) so the value persists
# to the next node, enabling source→target handoff detection.
_current_node: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_rifft_lg_current_node", default=None
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_if_present(span: Any, key: str, value: Any) -> None:
    if value is None:
        return
    span.set_attribute(key, value)


def _summarise_state(state: Any, limit: int = 500) -> str:
    if state is None:
        return ""
    try:
        raw = json.dumps(state, default=str)
    except Exception:
        raw = str(state)
    return raw[:limit]


def _wrap_callable(
    owner: type[Any],
    method_name: str,
    wrapper_factory: Callable[[Callable[..., Any]], Callable[..., Any]],
) -> bool:
    original = getattr(owner, method_name, None)
    if original is None or getattr(original, "__rifft_wrapped__", False):
        return False
    wrapped = wrapper_factory(original)
    setattr(wrapped, "__rifft_wrapped__", True)
    setattr(owner, method_name, wrapped)
    return True


# ---------------------------------------------------------------------------
# Node function wrapping
# ---------------------------------------------------------------------------

def _make_node_wrapper(node_name: str, fn: Callable[..., Any]) -> Callable[..., Any]:
    """Return a version of *fn* that emits rifft spans on each execution."""
    if getattr(fn, "__rifft_wrapped__", False):
        return fn

    if inspect.iscoroutinefunction(fn):
        async def async_node(*args: Any, **kwargs: Any) -> Any:
            prev = _current_node.get()
            _current_node.set(node_name)  # intentionally not reset — persists to next node

            state = args[0] if args else kwargs.get("state")

            if prev is not None and prev != node_name:
                with rifft.span("rifft.agent_to_agent", agent_id=prev, framework="langgraph") as hs:
                    hs.set_attribute("source_agent_id", prev)
                    hs.set_attribute("target_agent_id", node_name)
                    hs.set_attribute("message", _summarise_state(state))
                    hs.set_attribute("protocol", "agent_to_agent")

            with rifft.span("agent.execute", agent_id=node_name, framework="langgraph") as span:
                _set_if_present(span, "langgraph.node", node_name)
                _set_if_present(span, "langgraph.input_state", _summarise_state(state))
                result = await fn(*args, **kwargs)
                _set_if_present(span, "langgraph.output_state", _summarise_state(result))
                return result

        setattr(async_node, "__rifft_wrapped__", True)
        async_node.__name__ = getattr(fn, "__name__", node_name)
        return async_node

    def sync_node(*args: Any, **kwargs: Any) -> Any:
        prev = _current_node.get()
        _current_node.set(node_name)  # intentionally not reset — persists to next node

        state = args[0] if args else kwargs.get("state")

        if prev is not None and prev != node_name:
            with rifft.span("rifft.agent_to_agent", agent_id=prev, framework="langgraph") as hs:
                hs.set_attribute("source_agent_id", prev)
                hs.set_attribute("target_agent_id", node_name)
                hs.set_attribute("message", _summarise_state(state))
                hs.set_attribute("protocol", "agent_to_agent")

        with rifft.span("agent.execute", agent_id=node_name, framework="langgraph") as span:
            _set_if_present(span, "langgraph.node", node_name)
            _set_if_present(span, "langgraph.input_state", _summarise_state(state))
            result = fn(*args, **kwargs)
            _set_if_present(span, "langgraph.output_state", _summarise_state(result))
            return result

    setattr(sync_node, "__rifft_wrapped__", True)
    sync_node.__name__ = getattr(fn, "__name__", node_name)
    return sync_node


# ---------------------------------------------------------------------------
# StateGraph.add_node wrapping
# ---------------------------------------------------------------------------

def _wrap_add_node(state_graph_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            if not args:
                return original(self, *args, **kwargs)

            first = args[0]

            if isinstance(first, str) and len(args) >= 2 and callable(args[1]):
                # add_node("node_name", fn, ...)
                node_name, fn = first, args[1]
                return original(self, first, _make_node_wrapper(node_name, fn), *args[2:], **kwargs)

            if callable(first):
                # add_node(fn, ...) — node name derived from fn.__name__
                node_name = getattr(first, "__name__", None) or type(first).__name__
                return original(self, _make_node_wrapper(node_name, first), *args[1:], **kwargs)

            return original(self, *args, **kwargs)

        return wrapped

    _wrap_callable(state_graph_cls, "add_node", factory)


# ---------------------------------------------------------------------------
# Compiled graph invoke / ainvoke wrapping
# ---------------------------------------------------------------------------

def _wrap_compiled_graph(compiled_cls: type[Any]) -> None:
    def invoke_factory(original: Callable[..., Any]) -> Callable[..., Any]:
        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            graph_name = getattr(self, "name", None) or "langgraph"
            tok = _current_node.set(None)  # fresh slate for this run
            try:
                with rifft.span("langgraph.graph.invoke", agent_id=graph_name, framework="langgraph") as span:
                    _set_if_present(span, "langgraph.graph_name", graph_name)
                    return original(self, *args, **kwargs)
            finally:
                _current_node.reset(tok)

        return wrapped

    def ainvoke_factory(original: Callable[..., Any]) -> Callable[..., Any]:
        async def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            graph_name = getattr(self, "name", None) or "langgraph"
            tok = _current_node.set(None)
            try:
                with rifft.span("langgraph.graph.invoke", agent_id=graph_name, framework="langgraph") as span:
                    _set_if_present(span, "langgraph.graph_name", graph_name)
                    return await original(self, *args, **kwargs)
            finally:
                _current_node.reset(tok)

        return wrapped

    _wrap_callable(compiled_cls, "invoke", invoke_factory)
    _wrap_callable(compiled_cls, "ainvoke", ainvoke_factory)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def instrument() -> bool:
    global _INSTRUMENTED
    if _INSTRUMENTED:
        return True

    try:
        from langgraph.graph.state import StateGraph  # type: ignore
    except ImportError:
        return False

    _wrap_add_node(StateGraph)

    # Find the compiled graph class — import path varies across LangGraph versions
    compiled_cls = None
    _candidates = [
        ("langgraph.pregel", "Pregel"),
        ("langgraph.graph.state", "CompiledStateGraph"),
        ("langgraph.graph.graph", "CompiledGraph"),
    ]
    for mod_name, cls_name in _candidates:
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            candidate = getattr(mod, cls_name, None)
            if candidate is not None:
                compiled_cls = candidate
                break
        except ImportError:
            continue

    if compiled_cls is not None:
        _wrap_compiled_graph(compiled_cls)

    _INSTRUMENTED = True
    return True


instrument()
