from __future__ import annotations

import importlib
import json
import os

os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")

import rifft
from crewai import Agent, Crew, LLM, Process, Task


def main() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY must be set for real_model_validation.py")

    rifft.init(
        project_id=os.getenv("RIFFT_PROJECT_ID", "default"),
        endpoint=os.getenv("RIFFT_ENDPOINT", "http://localhost:4318"),
    )

    importlib.import_module("rifft.adapters.crewai")

    model_name = os.getenv("RIFFT_OPENAI_MODEL", "gpt-4.1-mini")
    llm = LLM(model=model_name)

    researcher = Agent(
        role="researcher",
        goal="Produce a few concise facts that another agent can rewrite.",
        backstory="A careful research assistant for runtime validation.",
        llm=llm,
        verbose=False,
    )
    writer = Agent(
        role="writer",
        goal="Rewrite findings into one short polished summary.",
        backstory="A concise technical writer for runtime validation.",
        llm=llm,
        verbose=False,
    )

    research_task = Task(
        description=(
            "Write exactly three short bullet points about why trace debugging matters for multi-agent AI systems. "
            "Keep each bullet under 12 words and do not use markdown headings."
        ),
        expected_output="Exactly three short bullet points.",
        agent=researcher,
    )
    write_task = Task(
        description=(
            "Using the previous bullet points, write one sentence under 25 words that explains the value of agent trace debugging."
        ),
        expected_output="One short sentence.",
        agent=writer,
    )

    crew = Crew(
        name="rifft-real-crewai-model-validation",
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        process=Process.sequential,
        verbose=False,
    )

    with rifft.span("real.crewai.model.validation", agent_id="orchestrator", framework="crewai") as span:
        result = crew.kickoff()
        span.set_attribute("validation.model", model_name)
        span.set_attribute("validation.result", str(result))
        with rifft.span("output.validate", agent_id="orchestrator", framework="crewai") as validation_span:
            validation_span.set_attribute("validation.passed", bool(str(result).strip()))
            validation_span.set_attribute("validation.output_length", len(str(result)))

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    print(
        json.dumps(
            {
                "framework": "crewai",
                "model": model_name,
                "result": str(result),
            }
        )
    )


if __name__ == "__main__":
    main()
