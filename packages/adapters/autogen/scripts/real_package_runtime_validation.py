from __future__ import annotations

import asyncio
import importlib
import json
import os
from typing import Sequence

import rifft
from autogen_agentchat.agents import BaseChatAgent
from autogen_agentchat.base import Response
from autogen_agentchat.messages import BaseChatMessage, TextMessage
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_core import CancellationToken


class EchoAgent(BaseChatAgent):
    def __init__(self, name: str) -> None:
        super().__init__(name=name, description=f"{name} validation agent")

    @property
    def produced_message_types(self) -> tuple[type[TextMessage], ...]:
        return (TextMessage,)

    async def on_messages(
        self,
        messages: Sequence[BaseChatMessage],
        cancellation_token: CancellationToken,
    ) -> Response:
        del cancellation_token
        latest = messages[-1].content if messages else "none"
        return Response(
            chat_message=TextMessage(
                source=self.name,
                content=f"{self.name}:{latest}",
            )
        )

    async def on_reset(self, cancellation_token: CancellationToken) -> None:
        del cancellation_token
        return None


async def _run_validation() -> dict[str, object]:
    rifft.init(
        project_id=os.getenv("RIFFT_PROJECT_ID", "default"),
        endpoint=os.getenv("RIFFT_ENDPOINT", "http://localhost:4318"),
    )

    importlib.import_module("rifft.adapters.autogen")

    planner = EchoAgent("planner")
    writer = EchoAgent("writer")
    reviewer = EchoAgent("reviewer")
    team = RoundRobinGroupChat([planner, writer, reviewer], max_turns=3)

    with rifft.span("real.autogen.runtime.validation", agent_id="manager", framework="autogen") as span:
        result = await team.run(task="Draft and review a tiny runtime validation summary.")
        span.set_attribute("validation.message_count", len(result.messages))
        span.set_attribute("validation.stop_reason", result.stop_reason or "none")

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    return {
        "framework": "autogen",
        "team_wrapped": bool(getattr(RoundRobinGroupChat.run, "__rifft_wrapped__", False)),
        "agent_wrapped": bool(getattr(BaseChatAgent.on_messages, "__rifft_wrapped__", False)),
        "message_count": len(result.messages),
        "stop_reason": result.stop_reason,
        "messages": [message.content for message in result.messages if hasattr(message, "content")],
    }


def main() -> None:
    print(json.dumps(asyncio.run(_run_validation())))


if __name__ == "__main__":
    main()
