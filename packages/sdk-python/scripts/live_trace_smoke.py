from __future__ import annotations

import uuid

import rifft


def main() -> None:
    test_id = f"python-smoke-{uuid.uuid4().hex[:12]}"

    rifft.init(project_id="default", endpoint="http://localhost:4318")

    @rifft.trace(agent_id="researcher", framework="custom")
    def research(topic: str) -> dict[str, object]:
        with rifft.span("tool_call", agent_id="researcher", framework="custom") as span:
            span.set_attribute("trace.test_id", test_id)
            span.set_attribute("tool.name", "web_search")
            span.set_attribute("tool.input", {"query": topic})
            span.set_attribute("tool.output", {"hits": 3})
            span.set_attribute("tool.result_length", 3)
        return {"topic": topic, "status": "ok"}

    with rifft.span("python.smoke.run", agent_id="orchestrator", framework="custom") as span:
        span.set_attribute("trace.test_id", test_id)
        result = research("python live smoke")
        span.set_attribute("trace.result", result)

    with rifft.span("output.validate", agent_id="orchestrator", framework="custom") as span:
        span.set_attribute("validation.passed", result.get("status") == "ok")
        span.set_attribute("validation.output", result)

    provider = rifft.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()

    print(test_id)


if __name__ == "__main__":
    main()
