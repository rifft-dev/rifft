from __future__ import annotations

import inspect
from typing import Any, Callable

import rifft

_INSTRUMENTED = False


def _get_agent_id(instance: Any) -> str:
    for attribute in ("name", "agent_id", "role", "id"):
        value = getattr(instance, attribute, None)
        if isinstance(value, str) and value:
            return value
    return type(instance).__name__.lower()


def _set_if_present(span: Any, key: str, value: Any) -> None:
    if value is None:
        return
    span.set_attribute(key, value)


def _normalize_message(message: Any) -> Any:
    if isinstance(message, dict):
        return message
    if isinstance(message, (str, int, float, bool, list, tuple)):
      return message

    for attribute in ("content", "message", "text", "summary"):
        value = getattr(message, attribute, None)
        if value is not None:
            return value

    return str(message)


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


def _wrap_agent_send(agent_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, message: Any, recipient: Any, *args: Any, **kwargs: Any) -> Any:
                sender = _get_agent_id(self)
                receiver = _get_agent_id(recipient)
                with rifft.span("autogen.message.send", agent_id=sender, framework="autogen") as span:
                    span.set_attribute("source_agent_id", sender)
                    span.set_attribute("target_agent_id", receiver)
                    span.set_attribute("message", _normalize_message(message))
                    span.set_attribute("protocol", "agent_to_agent")
                    _set_if_present(span, "autogen.message_kind", getattr(message, "type", None))
                    return await original(self, message, recipient, *args, **kwargs)

            return async_wrapped

        def wrapped(self: Any, message: Any, recipient: Any, *args: Any, **kwargs: Any) -> Any:
            sender = _get_agent_id(self)
            receiver = _get_agent_id(recipient)
            with rifft.span("autogen.message.send", agent_id=sender, framework="autogen") as span:
                span.set_attribute("source_agent_id", sender)
                span.set_attribute("target_agent_id", receiver)
                span.set_attribute("message", _normalize_message(message))
                span.set_attribute("protocol", "agent_to_agent")
                _set_if_present(span, "autogen.message_kind", getattr(message, "type", None))
                return original(self, message, recipient, *args, **kwargs)

        return wrapped

    for method_name in ("send", "a_send"):
        _wrap_callable(agent_cls, method_name, factory)


def _wrap_agent_receive(agent_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, message: Any, sender: Any | None = None, *args: Any, **kwargs: Any) -> Any:
                agent_id = _get_agent_id(self)
                with rifft.span("autogen.message.receive", agent_id=agent_id, framework="autogen") as span:
                    _set_if_present(span, "autogen.sender_agent", _get_agent_id(sender) if sender is not None else None)
                    span.set_attribute("autogen.receiver_agent", agent_id)
                    span.set_attribute("autogen.message", _normalize_message(message))
                    span.set_attribute("autogen.protocol", "agent_to_agent")
                    return await original(self, message, sender, *args, **kwargs)

            return async_wrapped

        def wrapped(self: Any, message: Any, sender: Any | None = None, *args: Any, **kwargs: Any) -> Any:
            agent_id = _get_agent_id(self)
            with rifft.span("autogen.message.receive", agent_id=agent_id, framework="autogen") as span:
                _set_if_present(span, "autogen.sender_agent", _get_agent_id(sender) if sender is not None else None)
                span.set_attribute("autogen.receiver_agent", agent_id)
                span.set_attribute("autogen.message", _normalize_message(message))
                span.set_attribute("autogen.protocol", "agent_to_agent")
                return original(self, message, sender, *args, **kwargs)

        return wrapped

    for method_name in ("receive", "a_receive"):
        _wrap_callable(agent_cls, method_name, factory)


def _wrap_groupchat_manager(manager_cls: type[Any]) -> None:
    def factory(original: Callable[..., Any]) -> Callable[..., Any]:
        if inspect.iscoroutinefunction(original):
            async def async_wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
                with rifft.span("autogen.groupchat.run", agent_id=_get_agent_id(self), framework="autogen") as span:
                    groupchat = getattr(self, "groupchat", None)
                    _set_if_present(span, "autogen.participant_count", len(getattr(groupchat, "agents", []) or []))
                    return await original(self, *args, **kwargs)

            return async_wrapped

        def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:
            with rifft.span("autogen.groupchat.run", agent_id=_get_agent_id(self), framework="autogen") as span:
                groupchat = getattr(self, "groupchat", None)
                _set_if_present(span, "autogen.participant_count", len(getattr(groupchat, "agents", []) or []))
                return original(self, *args, **kwargs)

        return wrapped

    for method_name in ("run_chat", "initiate_chat"):
        _wrap_callable(manager_cls, method_name, factory)


def instrument() -> bool:
    global _INSTRUMENTED
    if _INSTRUMENTED:
        return True

    try:
        from autogen import ConversableAgent, GroupChatManager  # type: ignore
    except ImportError:
        return False

    _wrap_agent_send(ConversableAgent)
    _wrap_agent_receive(ConversableAgent)
    _wrap_groupchat_manager(GroupChatManager)

    _INSTRUMENTED = True
    return True


instrument()
