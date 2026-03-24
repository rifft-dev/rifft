from __future__ import annotations

import inspect
from typing import Any, Callable, Optional

import rifft

_INSTRUMENTED = False


def _get_agent_id(instance: Any) -> str:
    for attribute in ("role", "agent_id", "name", "id"):
        value = getattr(instance, attribute, None)
        if isinstance(value, str) and value:
            return value

    return type(instance).__name__.lower()


def _set_if_present(span: Any, key: str, value: Any) -> None:
    if value is None:
        return
    span.set_attribute(key, value)


def _normalize_message(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool, list, dict, tuple)):
        return value

    for attribute in ("raw", "content", "output", "result", "text", "description"):
        candidate = getattr(value, attribute, None)
        if candidate is not None:
            return candidate

    return str(value)


def _emit_agent_to_agent_span(
    *,
    source_agent_id: str,
    target_agent_id: str,
    message: Any,
    framework: str = "crewai",
) -> None:
    if not source_agent_id or not target_agent_id:
        return

    with rifft.span("rifft.agent_to_agent", agent_id=source_agent_id, framework=framework) as span:
        span.set_attribute("source_agent_id", source_agent_id)
        span.set_attribute("target_agent_id", target_agent_id)
        span.set_attribute("message", _normalize_message(message))
        span.set_attribute("protocol", "agent_to_agent")


def _emit_sequential_communications(crew: Any, outputs: Any) -> None:
    agents = list(getattr(crew, "agents", []) or [])
    if len(agents) < 2:
        return

    if not isinstance(outputs, (list, tuple)):
        return

    normalized_outputs = list(outputs)
    if len(normalized_outputs) < 1:
        return

    for index in range(min(len(agents) - 1, len(normalized_outputs))):
        source_agent = agents[index]
        target_agent = agents[index + 1]
        _emit_agent_to_agent_span(
            source_agent_id=_get_agent_id(source_agent),
            target_agent_id=_get_agent_id(target_agent),
            message=normalized_outputs[index],
        )


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


def _wrap_kickoff(crew_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
                with rifft.span("crew.kickoff", agent_id="orchestrator", framework="crewai") as span:
                    _set_if_present(span, "crewai.crew_name", getattr(self, "name", None))
                    _set_if_present(span, "crewai.agent_count", len(getattr(self, "agents", []) or []))
                    _set_if_present(span, "crewai.task_count", len(getattr(self, "tasks", []) or []))
                    result = await original(self, *args, **kwargs)
                    _emit_sequential_communications(self, result)
                    return result

            return async_wrapped

        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            with rifft.span("crew.kickoff", agent_id="orchestrator", framework="crewai") as span:
                _set_if_present(span, "crewai.crew_name", getattr(self, "name", None))
                _set_if_present(span, "crewai.agent_count", len(getattr(self, "agents", []) or []))
                _set_if_present(span, "crewai.task_count", len(getattr(self, "tasks", []) or []))
                result = original(self, *args, **kwargs)
                _emit_sequential_communications(self, result)
                return result

        return wrapped

    _wrap_callable(crew_cls, "kickoff", factory)
    _wrap_callable(crew_cls, "kickoff_async", factory)


def _wrap_agent_execution(agent_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
                agent_id = _get_agent_id(self)
                with rifft.span("agent.execute", agent_id=agent_id, framework="crewai") as span:
                    task = args[0] if args else kwargs.get("task")
                    _set_if_present(span, "crewai.agent_role", getattr(self, "role", None))
                    _set_if_present(span, "crewai.agent_goal", getattr(self, "goal", None))
                    _set_if_present(span, "crewai.task", getattr(task, "description", task))
                    result = await original(self, *args, **kwargs)
                    _set_if_present(span, "rifft.return_type", type(result).__name__)
                    return result

            return async_wrapped

        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = _get_agent_id(self)
            with rifft.span("agent.execute", agent_id=agent_id, framework="crewai") as span:
                task = args[0] if args else kwargs.get("task")
                _set_if_present(span, "crewai.agent_role", getattr(self, "role", None))
                _set_if_present(span, "crewai.agent_goal", getattr(self, "goal", None))
                _set_if_present(span, "crewai.task", getattr(task, "description", task))
                result = original(self, *args, **kwargs)
                _set_if_present(span, "rifft.return_type", type(result).__name__)
                return result

        return wrapped

    for method_name in ("execute_task", "execute", "_execute"):
        _wrap_callable(agent_cls, method_name, factory)


def _wrap_tool_calls(tool_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
                agent_id = rifft.get_current_agent_id() or _get_agent_id(getattr(self, "agent", None) or self)
                tool_name = getattr(self, "name", type(self).__name__)
                with rifft.span("tool.call", agent_id=agent_id, framework="crewai") as span:
                    span.set_attribute("tool.name", tool_name)
                    span.set_attribute("tool.input", {"args": list(args), "kwargs": kwargs})
                    result = await original(self, *args, **kwargs)
                    span.set_attribute("tool.output", result)
                    return result

            return async_wrapped

        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = rifft.get_current_agent_id() or _get_agent_id(getattr(self, "agent", None) or self)
            tool_name = getattr(self, "name", type(self).__name__)
            with rifft.span("tool.call", agent_id=agent_id, framework="crewai") as span:
                span.set_attribute("tool.name", tool_name)
                span.set_attribute("tool.input", {"args": list(args), "kwargs": kwargs})
                result = original(self, *args, **kwargs)
                span.set_attribute("tool.output", result)
                return result

        return wrapped

    for method_name in ("run", "_run"):
        _wrap_callable(tool_cls, method_name, factory)


def instrument() -> bool:
    global _INSTRUMENTED
    if _INSTRUMENTED:
        return True

    try:
        from crewai import Agent, Crew  # type: ignore
    except ImportError:
        return False

    try:
        from crewai.tools import BaseTool  # type: ignore
    except ImportError:
        BaseTool = None  # type: ignore

    _wrap_kickoff(Crew)
    _wrap_agent_execution(Agent)
    if BaseTool is not None:
        _wrap_tool_calls(BaseTool)

    _INSTRUMENTED = True
    return True


instrument()
