from __future__ import annotations

import inspect
import json
import time
from typing import Any, Callable, Dict, Optional

import rifft

_INSTRUMENTED = False
_MAX_OUTPUT_LENGTH = 10_240


def _truncate(value: str, max_length: int = _MAX_OUTPUT_LENGTH) -> str:
    if len(value) <= max_length:
        return value
    return f"{value[:max_length]}..."


def _to_json(value: Any) -> str:
    try:
        return _truncate(json.dumps(value, default=str))
    except TypeError:
        return _truncate(str(value))


def _to_traceparent(context: dict[str, str]) -> str:
    return f"00-{context['trace_id']}-{context['span_id']}-01"


def _inject_trace_headers(kwargs: dict[str, Any]) -> dict[str, Any]:
    context = rifft.get_current_trace_context()
    if not context:
        return kwargs

    traceparent = _to_traceparent(context)
    next_kwargs = dict(kwargs)
    headers = next_kwargs.get("headers")
    if not isinstance(headers, dict):
        headers = {}

    next_kwargs["headers"] = {
        **headers,
        "traceparent": traceparent,
        "x-rifft-traceparent": traceparent,
    }
    return next_kwargs


def _normalize_args(args: tuple[Any, ...]) -> tuple[Any, ...]:
    if args and not isinstance(args[0], (str, dict)):
        return args[1:]
    return args


def _extract_tool_name(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    normalized_args = _normalize_args(args)
    if normalized_args and isinstance(normalized_args[0], str):
        return normalized_args[0]

    for candidate in (kwargs.get("name"), kwargs.get("tool_name"), kwargs.get("toolName")):
        if isinstance(candidate, str) and candidate:
            return candidate

    if normalized_args and isinstance(normalized_args[0], dict):
        first = normalized_args[0]
        for key in ("name", "tool_name", "toolName"):
            candidate = first.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate

    return "unknown_tool"


def _extract_input(args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
    normalized_args = _normalize_args(args)
    if len(normalized_args) > 1:
        return normalized_args[1]

    for key in ("arguments", "params", "input"):
        if key in kwargs:
            return kwargs[key]

    if normalized_args and isinstance(normalized_args[0], dict):
        first = normalized_args[0]
        return first.get("arguments") or first.get("params") or first

    return None


def _wrap_callable(
    owner: Any,
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


def instrument_mcp_client(client: Any, *, agent_id: Optional[str] = None, framework: str = "custom", server_name: str = "mcp-server") -> Any:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(*args: Any, **kwargs: Any) -> Any:
                tool_name = _extract_tool_name(args, kwargs)
                tool_input = _extract_input(args, kwargs)
                current_agent = agent_id or rifft.get_current_agent_id() or "mcp-client"
                next_kwargs = _inject_trace_headers(kwargs)

                with rifft.span("tool.call", agent_id=current_agent, framework=framework) as span:
                    span.set_attribute("tool.name", tool_name)
                    span.set_attribute("tool.input", tool_input)
                    span.set_attribute("mcp.tool_name", tool_name)
                    span.set_attribute("mcp.server_name", server_name)
                    span.set_attribute("mcp.input", _to_json(tool_input))
                    started_at = time.perf_counter()
                    result = await original(*args, **next_kwargs)
                    duration_ms = (time.perf_counter() - started_at) * 1000
                    span.set_attribute("tool.output", result)
                    span.set_attribute("mcp.output", _to_json(result))
                    span.set_attribute("mcp.duration_ms", duration_ms)
                    return result

            return async_wrapped

        def wrapped(*args: Any, **kwargs: Any) -> Any:
            tool_name = _extract_tool_name(args, kwargs)
            tool_input = _extract_input(args, kwargs)
            current_agent = agent_id or rifft.get_current_agent_id() or "mcp-client"
            next_kwargs = _inject_trace_headers(kwargs)

            with rifft.span("tool.call", agent_id=current_agent, framework=framework) as span:
                span.set_attribute("tool.name", tool_name)
                span.set_attribute("tool.input", tool_input)
                span.set_attribute("mcp.tool_name", tool_name)
                span.set_attribute("mcp.server_name", server_name)
                span.set_attribute("mcp.input", _to_json(tool_input))
                started_at = time.perf_counter()
                result = original(*args, **next_kwargs)
                duration_ms = (time.perf_counter() - started_at) * 1000
                span.set_attribute("tool.output", result)
                span.set_attribute("mcp.output", _to_json(result))
                span.set_attribute("mcp.duration_ms", duration_ms)
                return result

        return wrapped

    for method_name in ("call_tool", "callTool"):
        _wrap_callable(client, method_name, factory)

    return client


def instrument() -> bool:
    global _INSTRUMENTED
    if _INSTRUMENTED:
        return True

    patched = False

    try:
        from mcp import ClientSession  # type: ignore

        instrument_mcp_client(ClientSession)
        patched = True
    except ImportError:
        pass
    except AttributeError:
        pass

    try:
        from mcp.client.session import ClientSession as SessionClient  # type: ignore

        instrument_mcp_client(SessionClient)
        patched = True
    except ImportError:
        pass
    except AttributeError:
        pass

    _INSTRUMENTED = patched
    return patched


instrument()
