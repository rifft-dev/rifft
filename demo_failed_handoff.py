"""
Rifft demo: failed handoff in a 3-agent research pipeline.

This script simulates a realistic multi-agent workflow where the researcher
agent returns a malformed payload, the writer agent crashes trying to parse
it, and the orchestrator fails to catch the error before propagation.

Run this, then open Rifft to see the trace graph with the handoff failure
highlighted — that's your demo GIF.

Setup:
  pip install rifft-sdk

Fill in your credentials below, then:
  python demo_failed_handoff.py
"""

import time
import rifft

# ── Credentials ──────────────────────────────────────────────────────────────
# Copy these from rifft.dev → Settings → API key
PROJECT_ID = "cloud-fe0764f8-08b39a11"
API_KEY    = "rft_live_bc6067db0723b629b02079de743b509b0bec"
ENDPOINT   = "https://rifft.dev/api/ingest"
# ─────────────────────────────────────────────────────────────────────────────

rifft.init(
    project_id=PROJECT_ID,
    api_key=API_KEY,
    endpoint=ENDPOINT,
)

TASK = "Write a 200-word summary of recent breakthroughs in multi-agent AI systems."


def researcher_agent(task: str) -> dict:
    """
    Simulates a researcher that fetches sources and extracts key points.
    BUG: returns `findings` as a plain string instead of the expected list,
    so the downstream writer agent cannot iterate over it.
    """
    with rifft.span("researcher.run", agent_id="researcher") as span:
        span.set_attribute("input.task", task)
        span.capture_decision(
            system_prompt="You are a research agent. Extract key findings from sources.",
            conversation_history=[{"role": "user", "content": task}],
            available_tools=["web_search", "extract_text"],
            chosen_action="web_search",
            reasoning="Need to find recent papers on multi-agent AI systems.",
        )

        # Simulate network latency
        time.sleep(0.4)

        # BUG: `findings` should be a list of strings, but is returned as a
        # single concatenated string — the writer agent will crash on iteration.
        payload = {
            "sources_checked": 7,
            "findings": "AutoGen 0.4 released; CrewAI adds memory; OpenAI multi-agent evals published",
            # ↑ Should be: ["AutoGen 0.4 released", "CrewAI adds memory", ...]
        }

        span.set_attribute("output.sources_checked", payload["sources_checked"])
        span.set_attribute("output.findings_type", type(payload["findings"]).__name__)
        return payload


def validator_agent(researcher_output: dict) -> dict:
    """
    Should validate the researcher's output before passing it downstream.
    Fails to check the type of `findings`, so the malformed payload passes.
    """
    with rifft.span("validator.run", agent_id="validator") as span:
        span.set_attribute("input.sources_checked", researcher_output.get("sources_checked", 0))
        span.capture_decision(
            system_prompt="You are a validation agent. Check that researcher output is complete.",
            conversation_history=[],
            available_tools=["schema_check"],
            chosen_action="schema_check",
            reasoning="Verifying researcher output has required fields.",
        )

        time.sleep(0.2)

        # Only checks for key presence, not type — misses the bug
        if "findings" not in researcher_output:
            raise ValueError("Missing 'findings' field in researcher output.")

        span.set_attribute("validation.passed", True)
        return researcher_output  # passes the bad payload through unchecked


def writer_agent(validated_output: dict) -> str:
    """
    Expects `findings` to be a list it can iterate over.
    Crashes with a TypeError because it received a string instead.
    """
    with rifft.span("writer.run", agent_id="writer") as span:
        span.set_attribute("input.findings_received", str(validated_output.get("findings", "")))
        span.capture_decision(
            system_prompt="You are a writing agent. Turn research findings into a polished summary.",
            conversation_history=[],
            available_tools=["draft_text"],
            chosen_action="draft_text",
            reasoning="Iterating over findings to build a structured summary.",
        )

        time.sleep(0.3)

        findings = validated_output["findings"]

        # Crashes: iterating a string character-by-character instead of
        # iterating a list of finding strings.
        bullet_points = [f"• {point.strip()}" for point in findings]  # TypeError would surface here in stricter mode

        # Simulates the writer producing garbage output because it iterated
        # over individual characters rather than findings.
        if len(bullet_points) > 20:
            raise TypeError(
                f"writer.run: expected findings to be a list of strings, "
                f"got {type(findings).__name__!r}. "
                f"Received {len(findings)} characters instead of discrete findings. "
                f"Handoff from researcher is malformed."
            )

        return "\n".join(bullet_points)


def orchestrator(task: str) -> None:
    with rifft.span("orchestrator.run", agent_id="orchestrator") as span:
        span.set_attribute("input.task", task)
        span.capture_decision(
            system_prompt="You are an orchestrator. Coordinate researcher → validator → writer.",
            conversation_history=[{"role": "user", "content": task}],
            available_tools=["delegate_to_researcher", "delegate_to_validator", "delegate_to_writer"],
            chosen_action="delegate_to_researcher",
            reasoning="Starting with research phase before writing.",
        )

        try:
            research = researcher_agent(task)
            validated = validator_agent(research)
            result = writer_agent(validated)
            span.set_attribute("output.result", result)
            span.set_eval_label("pass")
            print("✓ Pipeline completed:\n", result)
        except Exception as e:
            # Orchestrator catches the error but has no recovery path —
            # the run terminates with the writer's failure surfaced.
            span.set_eval_label("fail")
            print(f"✗ Pipeline failed: {e}")
            raise


if __name__ == "__main__":
    print(f"Running demo pipeline for task:\n  {TASK}\n")
    try:
        orchestrator(TASK)
    except Exception:
        pass  # Error already captured in spans; Rifft has the full trace.

    # Give the batch exporter a moment to flush before the process exits.
    time.sleep(1)
    print("\nTrace sent. Open Rifft to see the handoff failure.")
