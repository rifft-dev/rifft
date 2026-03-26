from __future__ import annotations

import asyncio
import importlib
import json
import os

import rifft
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_ext.models.openai import OpenAIChatCompletionClient


async def _run_validation() -> dict[str, object]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY must be set for real_model_validation.py")

    rifft.init(
        project_id=os.getenv("RIFFT_PROJECT_ID", "default"),
        endpoint=os.getenv("RIFFT_ENDPOINT", "http://localhost:4318"),
    )

    importlib.import_module("rifft.adapters.autogen")

    model_name = os.getenv("RIFFT_OPENAI_MODEL", "gpt-4.1-mini")
    model_client = OpenAIChatCompletionClient(model=model_name)

    planner = AssistantAgent(
        name="planner",
        model_client=model_client,
        system_message=(
            "You create a tiny plan for debugging multi-agent traces. "
            "Reply with one short sentence and end with TERMINATE."
        ),
    )
    reviewer = AssistantAgent(
        name="reviewer",
        model_client=model_client,
        system_message=(
            "You refine the previous answer into one clearer sentence. "
            "Reply with one short sentence and end with TERMINATE."
        ),
    )

    team = RoundRobinGroupChat(
        [planner, reviewer],
        max_turns=2,
        name="rifft-real-autogen-model-validation",
    )

    with rifft.span("real.autogen.model.validation", agent_id="manager", framework="autogen") as span:
        result = await team.run(
            task="Explain the value of tracing agent-to-agent decisions in under 20 words.",
        )
        span.set_attribute("validation.model", model_name)
        span.set_attribute("validation.message_count", len(result.messages))
        span.set_attribute("validation.stop_reason", result.stop_reason or "none")

    await model_client.close()

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    return {
        "framework": "autogen",
        "model": model_name,
        "message_count": len(result.messages),
        "stop_reason": result.stop_reason,
        "messages": [message.content for message in result.messages if hasattr(message, "content")],
    }


def main() -> None:
    print(json.dumps(asyncio.run(_run_validation())))


if __name__ == "__main__":
    main()
