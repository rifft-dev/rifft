from __future__ import annotations

import importlib
import sys
import types
import uuid

import rifft


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


def install_fake_autogen() -> None:
    autogen_module = types.ModuleType("autogen")
    autogen_module.ConversableAgent = FakeConversableAgent
    autogen_module.GroupChat = FakeGroupChat
    autogen_module.GroupChatManager = FakeGroupChatManager
    sys.modules["autogen"] = autogen_module


def main() -> None:
    test_id = f"autogen-adapter-smoke-{uuid.uuid4().hex[:12]}"
    install_fake_autogen()

    rifft.init(project_id="default", endpoint="http://localhost:4318")
    importlib.import_module("rifft.adapters.autogen")

    planner = FakeConversableAgent("planner")
    writer = FakeConversableAgent("writer")
    reviewer = FakeConversableAgent("reviewer")
    manager = FakeGroupChatManager("manager", FakeGroupChat([planner, writer, reviewer]))

    with rifft.span("autogen.smoke.root", agent_id="manager", framework="autogen") as span:
        span.set_attribute("trace.test_id", test_id)
        manager.run_chat()
        planner.send(
            {"content": f"Draft an engineering summary for {test_id} with 3 key points."},
            writer,
        )
        writer.send(
            {"content": f"Review the draft for {test_id} and suggest one improvement."},
            reviewer,
        )

    with rifft.span("output.validate", agent_id="manager", framework="autogen") as span:
        span.set_attribute("validation.passed", True)
        span.set_attribute("validation.output", {"test_id": test_id, "steps": 2})

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    print(test_id)


if __name__ == "__main__":
    main()
