from __future__ import annotations

import functools
import inspect
import json
import sys
import threading
import urllib.request
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, Optional, Sequence, TypeVar, cast

from opentelemetry import trace as otel_trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.trace import SpanKind, Status, StatusCode

F = TypeVar("F", bound=Callable[..., Any])

_MAX_VALUE_LENGTH = 2048
_CURRENT_AGENT_ID: ContextVar[Optional[str]] = ContextVar("rifft_current_agent_id", default=None)
_CURRENT_FRAMEWORK: ContextVar[Optional[str]] = ContextVar("rifft_current_framework", default=None)


@dataclass
class _Config:
    project_id: str
    endpoint: str
    api_key: Optional[str] = None


class _JsonTraceExporter(SpanExporter):
    def __init__(self, endpoint: str, api_key: Optional[str]) -> None:
        self._endpoint = endpoint
        self._api_key = api_key

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        envelope = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": self._resource_attributes(spans),
                    },
                    "scopeSpans": [
                        {
                            "spans": [self._serialize_span(span) for span in spans],
                        }
                    ],
                }
            ]
        }
        body = json.dumps(envelope).encode("utf-8")
        headers = {
            "content-type": "application/json",
        }
        if self._api_key:
            headers["authorization"] = f"Bearer {self._api_key}"

        request = urllib.request.Request(
            self._endpoint,
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request) as response:
                if 200 <= response.status < 300:
                    return SpanExportResult.SUCCESS
        except Exception as error:
            print(f"rifft exporter failed: {error}", file=sys.stderr)
            return SpanExportResult.FAILURE

        return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        return None

    def _resource_attributes(self, spans: Sequence[ReadableSpan]) -> list[dict[str, object]]:
        if not spans:
            return []

        resource_attributes = spans[0].resource.attributes
        return [self._kv(key, value) for key, value in resource_attributes.items()]

    def _serialize_span(self, span: ReadableSpan) -> dict[str, object]:
        return {
            "traceId": f"{span.context.trace_id:032x}",
            "spanId": f"{span.context.span_id:016x}",
            "parentSpanId": f"{span.parent.span_id:016x}" if span.parent else None,
            "name": span.name,
            "startTimeUnixNano": str(span.start_time),
            "endTimeUnixNano": str(span.end_time),
            "attributes": [self._kv(key, value) for key, value in span.attributes.items()],
            "events": [
                {
                    "name": event.name,
                    "timeUnixNano": str(event.timestamp),
                    "attributes": [self._kv(key, value) for key, value in (event.attributes or {}).items()],
                }
                for event in span.events
            ],
            "status": {
                "code": span.status.status_code.value,
            },
        }

    def _kv(self, key: str, value: Any) -> dict[str, object]:
        return {
            "key": key,
            "value": self._attribute_value(value),
        }

    def _attribute_value(self, value: Any) -> dict[str, object]:
        if isinstance(value, bool):
            return {"boolValue": value}
        if isinstance(value, int):
            return {"intValue": str(value)}
        if isinstance(value, float):
            return {"doubleValue": value}
        if isinstance(value, (list, tuple)):
            return {
                "arrayValue": {
                    "values": [self._attribute_value(item) for item in value],
                }
            }
        if isinstance(value, dict):
            return {
                "kvlistValue": {
                    "values": [self._kv(str(key), item) for key, item in value.items()],
                }
            }

        return {"stringValue": "" if value is None else str(value)}


class _RifftSpan:
    def __init__(self, name: str, agent_id: str, framework: str = "custom") -> None:
        self.name = name
        self.agent_id = agent_id
        self.framework = framework
        self._manager: Any = None
        self._span: Any = None
        self._agent_token: Optional[Token[Optional[str]]] = None
        self._framework_token: Optional[Token[Optional[str]]] = None

    def __enter__(self) -> "_RifftSpan":
        tracer = _get_tracer()
        self._manager = tracer.start_as_current_span(self.name, kind=SpanKind.INTERNAL)
        self._span = self._manager.__enter__()
        self._agent_token = _CURRENT_AGENT_ID.set(self.agent_id)
        self._framework_token = _CURRENT_FRAMEWORK.set(self.framework)
        self._span.set_attribute("agent_id", self.agent_id)
        self._span.set_attribute("framework", self.framework)
        self._span.set_attribute("project_id", _require_config().project_id)
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self._span is not None and exc is not None:
            self._span.record_exception(exc)
            self._span.set_status(Status(StatusCode.ERROR, str(exc)))
            self._span.set_attribute("exception.type", type(exc).__name__)
            self._span.set_attribute("exception.message", _sanitize_value(str(exc)))
        elif self._span is not None:
            self._span.set_status(Status(StatusCode.OK))

        if self._manager is not None:
            self._manager.__exit__(exc_type, exc, tb)
        if self._framework_token is not None:
            _CURRENT_FRAMEWORK.reset(self._framework_token)
        if self._agent_token is not None:
            _CURRENT_AGENT_ID.reset(self._agent_token)

    def set_attribute(self, key: str, value: Any) -> None:
        if self._span is None:
            raise RuntimeError("Span has not been entered yet.")

        self._span.set_attribute(key, _sanitize_attribute_value(value))

    def capture_decision(
        self,
        *,
        system_prompt: str,
        conversation_history: list[Any],
        available_tools: list[str],
        chosen_action: str,
        reasoning: Optional[str] = None,
    ) -> None:
        payload = {
            "system_prompt": system_prompt,
            "conversation_history": conversation_history,
            "available_tools": available_tools,
            "chosen_action": chosen_action,
            "reasoning": reasoning,
        }
        self.set_attribute("rifft.decision", payload)


_config: Optional[_Config] = None
_provider_lock = threading.Lock()
_provider_initialized = False


def _sanitize_value(value: Any) -> str:
    if value is None:
        return "null"

    if isinstance(value, (str, int, float, bool)):
        rendered = str(value)
    else:
        try:
            rendered = json.dumps(value, default=str)
        except TypeError:
            rendered = repr(value)

    if len(rendered) > _MAX_VALUE_LENGTH:
        return f"{rendered[:_MAX_VALUE_LENGTH]}..."

    return rendered


def _sanitize_attribute_value(value: Any) -> Any:
    if value is None:
        return "null"

    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value

    if isinstance(value, float):
        return value

    if isinstance(value, str):
        return _sanitize_value(value)

    if isinstance(value, (list, tuple)):
        return tuple(_sanitize_value(item) for item in cast(Iterable[Any], value))

    return _sanitize_value(value)


def _require_config() -> _Config:
    if _config is None:
        raise RuntimeError("rifft.init(...) must be called before tracing spans.")

    return _config


def _build_export_headers(config: _Config) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if config.api_key:
        headers["authorization"] = f"Bearer {config.api_key}"
    return headers


def _normalize_endpoint(endpoint: str) -> str:
    if endpoint.endswith("/v1/traces"):
        return endpoint

    return endpoint.rstrip("/") + "/v1/traces"


def _ensure_provider() -> None:
    global _provider_initialized

    if _provider_initialized:
        return

    config = _require_config()

    with _provider_lock:
        if _provider_initialized:
            return

        resource = Resource.create(
            {
                "service.name": "rifft-sdk-python",
                "project_id": config.project_id,
            }
        )
        provider = TracerProvider(resource=resource)
        exporter = _JsonTraceExporter(
            endpoint=_normalize_endpoint(config.endpoint),
            api_key=config.api_key,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        otel_trace.set_tracer_provider(provider)
        _provider_initialized = True


def _get_tracer():
    _ensure_provider()
    return otel_trace.get_tracer("rifft.sdk-python", "0.1.0")


def get_tracer_provider() -> TracerProvider:
    _ensure_provider()
    return cast(TracerProvider, otel_trace.get_tracer_provider())


def get_current_agent_id() -> Optional[str]:
    return _CURRENT_AGENT_ID.get()


def get_current_framework() -> Optional[str]:
    return _CURRENT_FRAMEWORK.get()


def init(*, project_id: str, endpoint: str, api_key: Optional[str] = None) -> None:
    global _config
    _config = _Config(project_id=project_id, endpoint=endpoint, api_key=api_key)
    _ensure_provider()


def _set_function_attributes(
    rifft_span: _RifftSpan,
    func: Callable[..., Any],
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
) -> None:
    rifft_span.set_attribute("code.function", func.__name__)
    rifft_span.set_attribute("rifft.function.args", list(args))
    rifft_span.set_attribute("rifft.function.kwargs", kwargs)


def trace(*, agent_id: str, framework: str = "custom") -> Callable[[F], F]:
    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                with span(func.__name__, agent_id=agent_id, framework=framework) as rifft_span:
                    _set_function_attributes(rifft_span, func, args, kwargs)
                    try:
                        result = await func(*args, **kwargs)
                    except Exception:
                        raise

                    rifft_span.set_attribute("rifft.return_type", type(result).__name__)
                    return result

            return cast(F, async_wrapper)

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            with span(func.__name__, agent_id=agent_id, framework=framework) as rifft_span:
                _set_function_attributes(rifft_span, func, args, kwargs)
                try:
                    result = func(*args, **kwargs)
                except Exception:
                    raise

                rifft_span.set_attribute("rifft.return_type", type(result).__name__)
                return result

        return cast(F, sync_wrapper)

    return decorator


def span(name: str, *, agent_id: str, framework: str = "custom") -> _RifftSpan:
    _require_config()
    return _RifftSpan(name=name, agent_id=agent_id, framework=framework)
