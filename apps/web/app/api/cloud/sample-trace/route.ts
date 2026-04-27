import { NextResponse } from "next/server";
import { getProjectSettings } from "@/app/lib/api";

const hex = (bytes: number) =>
  Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");

const nano = (offsetMs: number, baseMs: number) =>
  String((baseMs + offsetMs) * 1_000_000);

/**
 * Generates a realistic 3-agent content-pipeline trace and sends it to the
 * ingest endpoint. The orchestrator kicks off a researcher (which hits a
 * tool_call_hallucination) and a writer, so the trace detail page immediately
 * shows a root cause, a failing agent, and inter-agent messages.
 */
export async function POST() {
  let project: Awaited<ReturnType<typeof getProjectSettings>>;
  try {
    project = await getProjectSettings();
  } catch {
    return NextResponse.json({ error: "could_not_load_project" }, { status: 500 });
  }

  if (!project.api_key) {
    return NextResponse.json(
      { error: "no_api_key", message: "Only project owners can send a sample trace." },
      { status: 403 },
    );
  }

  const traceId = hex(16);
  const base = Date.now() - 9_000; // trace started 9 seconds ago

  // Span IDs
  const orchSpanId = hex(8);
  const researcherSpanId = hex(8);
  const writerSpanId = hex(8);
  const handoffToResearcherSpanId = hex(8);
  const handoffToWriterSpanId = hex(8);
  const toolCallSpanId = hex(8);

  const attr = (key: string, value: string) => ({
    key,
    value: { stringValue: value },
  });

  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [attr("service.name", "rifft-sample-pipeline")],
        },
        scopeSpans: [
          {
            spans: [
              // ── Orchestrator (root span, error because researcher failed) ──
              {
                traceId,
                spanId: orchSpanId,
                name: "content-pipeline.run",
                startTimeUnixNano: nano(0, base),
                endTimeUnixNano: nano(8_500, base),
                attributes: [
                  attr("agent_id", "orchestrator"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                ],
                status: { code: 2 }, // STATUS_CODE_ERROR
              },

              // ── Orchestrator → Researcher handoff ──
              {
                traceId,
                spanId: handoffToResearcherSpanId,
                parentSpanId: orchSpanId,
                name: "agent.message",
                startTimeUnixNano: nano(400, base),
                endTimeUnixNano: nano(420, base),
                attributes: [
                  attr("agent_id", "orchestrator"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                  attr("rifft.message.sender", "orchestrator"),
                  attr("rifft.message.receiver", "researcher"),
                  attr("rifft.message.content", "Research the top 3 causes of context window overflow in multi-agent systems. Use the knowledge_search tool."),
                ],
                status: { code: 1 },
              },

              // ── Researcher (fails with tool call hallucination) ──
              {
                traceId,
                spanId: researcherSpanId,
                parentSpanId: orchSpanId,
                name: "researcher.run",
                startTimeUnixNano: nano(500, base),
                endTimeUnixNano: nano(5_200, base),
                attributes: [
                  attr("agent_id", "researcher"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                  attr("cost_usd", "0.0038"),
                ],
                status: { code: 2 },
              },

              // ── Tool call that hallucinates (child of researcher) ──
              {
                traceId,
                spanId: toolCallSpanId,
                parentSpanId: researcherSpanId,
                name: "tool.knowledge_search",
                startTimeUnixNano: nano(800, base),
                endTimeUnixNano: nano(1_200, base),
                attributes: [
                  attr("agent_id", "researcher"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                  attr("tool.name", "knowledge_search"),
                  attr("tool.input", JSON.stringify({ query: "context window overflow multi-agent" })),
                  attr("tool.error", "ToolNotFoundError: knowledge_search is not registered in this runtime. Available tools: web_search, summarise"),
                ],
                status: { code: 2 },
                events: [
                  {
                    name: "tool_call_error",
                    timeUnixNano: nano(1_100, base),
                    attributes: [
                      attr("exception.type", "ToolNotFoundError"),
                      attr("exception.message", "knowledge_search is not registered in this runtime"),
                    ],
                  },
                ],
              },

              // ── Orchestrator → Writer handoff ──
              {
                traceId,
                spanId: handoffToWriterSpanId,
                parentSpanId: orchSpanId,
                name: "agent.message",
                startTimeUnixNano: nano(5_400, base),
                endTimeUnixNano: nano(5_420, base),
                attributes: [
                  attr("agent_id", "orchestrator"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                  attr("rifft.message.sender", "orchestrator"),
                  attr("rifft.message.receiver", "writer"),
                  attr("rifft.message.content", "Research incomplete due to tool error. Write a short summary based on available context only."),
                ],
                status: { code: 1 },
              },

              // ── Writer (completes successfully) ──
              {
                traceId,
                spanId: writerSpanId,
                parentSpanId: orchSpanId,
                name: "writer.run",
                startTimeUnixNano: nano(5_500, base),
                endTimeUnixNano: nano(8_200, base),
                attributes: [
                  attr("agent_id", "writer"),
                  attr("framework", "custom"),
                  attr("project_id", project.id),
                  attr("cost_usd", "0.0021"),
                ],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };

  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "https://ingest.rifft.dev";
  let ingestResponse: Response;
  try {
    ingestResponse = await fetch(`${ingestUrl}/v1/traces`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${project.api_key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json(
      { error: "ingest_unavailable", message: "Could not reach the ingest endpoint." },
      { status: 502 },
    );
  }

  if (!ingestResponse.ok) {
    const body = (await ingestResponse.json().catch(() => ({}))) as { error?: string };
    return NextResponse.json(
      { error: body.error ?? "ingest_failed", message: "Ingest rejected the sample trace." },
      { status: ingestResponse.status },
    );
  }

  return NextResponse.json({ traceId });
}
