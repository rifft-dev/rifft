type OtlpKeyValue = {
  key?: string;
  value?: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values?: OtlpKeyValue["value"][] };
    kvlistValue?: { values?: OtlpKeyValue[] };
  };
};

type OtlpEvent = {
  name?: string;
  timeUnixNano?: string;
  attributes?: OtlpKeyValue[];
};

type OtlpSpan = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtlpKeyValue[];
  events?: OtlpEvent[];
  status?: { code?: number };
};

type OtlpScopeSpan = {
  spans?: OtlpSpan[];
};

type OtlpResourceSpan = {
  resource?: { attributes?: OtlpKeyValue[] };
  scopeSpans?: OtlpScopeSpan[];
};

export type OtlpEnvelope = {
  resourceSpans?: OtlpResourceSpan[];
};

export type NormalizedSpan = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  start_time_unix_nano: string;
  end_time_unix_nano: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  attributes: string;
  events: string;
  resource: string;
  agent_id: string;
  framework: string;
  project_id: string;
  numericCostUsd: number;
};

export type TraceSummary = {
  traceId: string;
  projectId: string;
  rootSpanName: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "ok" | "error" | "unset";
  frameworks: string[];
  agentCount: number;
  spanCount: number;
  totalCostUsd: number;
};

const fromHex = (value: string | undefined) => {
  if (!value) {
    return "";
  }

  if (/^[0-9a-f]+$/i.test(value)) {
    return value.toLowerCase();
  }

  return Buffer.from(value, "base64").toString("hex");
};

const unwrapValue = (value: OtlpKeyValue["value"] | undefined): unknown => {
  if (!value) {
    return null;
  }

  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.intValue !== undefined) {
    return Number(value.intValue);
  }

  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if (value.boolValue !== undefined) {
    return value.boolValue;
  }

  if (value.arrayValue?.values) {
    return value.arrayValue.values.map((entry) => unwrapValue(entry));
  }

  if (value.kvlistValue?.values) {
    return toObject(value.kvlistValue.values);
  }

  return null;
};

const toObject = (attributes: OtlpKeyValue[] = []) =>
  Object.fromEntries(
    attributes
      .filter((entry): entry is Required<Pick<OtlpKeyValue, "key">> & OtlpKeyValue => Boolean(entry.key))
      .map((entry) => [entry.key, unwrapValue(entry.value)]),
  );

const nanosToIso = (value: string | undefined) => {
  const nanos = BigInt(value ?? "0");
  const millis = Number(nanos / 1_000_000n);
  const base = new Date(millis).toISOString().replace(/\.\d{3}Z$/, "");
  const fractional = (nanos % 1_000_000_000n).toString().padStart(9, "0");
  return `${base}.${fractional}Z`;
};

const nanosToDurationMs = (startValue: string | undefined, endValue: string | undefined) => {
  const start = BigInt(startValue ?? "0");
  const end = BigInt(endValue ?? "0");
  return Number(end - start) / 1_000_000;
};

const spanStatus = (code: number | undefined): "ok" | "error" | "unset" => {
  if (code === 1) {
    return "ok";
  }

  if (code === 2) {
    return "error";
  }

  return "unset";
};

const extractProjectId = (attributes: Record<string, unknown>, resource: Record<string, unknown>) => {
  const value =
    attributes["project_id"] ??
    attributes["rifft.project_id"] ??
    resource["project_id"] ??
    resource["service.name"];

  return typeof value === "string" && value.length > 0 ? value : "default";
};

const extractFramework = (attributes: Record<string, unknown>) => {
  const value = attributes["framework"] ?? attributes["rifft.framework"];
  return typeof value === "string" && value.length > 0 ? value : "custom";
};

const extractAgentId = (attributes: Record<string, unknown>) => {
  const value = attributes["agent_id"] ?? attributes["rifft.agent_id"];
  return typeof value === "string" && value.length > 0 ? value : "unknown";
};

const extractCost = (attributes: Record<string, unknown>) => {
  const value = attributes["cost_usd"] ?? attributes["llm.cost_usd"] ?? 0;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const normalizeEnvelope = (envelope: OtlpEnvelope) => {
  const spans: NormalizedSpan[] = [];

  for (const resourceSpan of envelope.resourceSpans ?? []) {
    const resource = toObject(resourceSpan.resource?.attributes ?? []);

    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        const attributes = toObject(span.attributes ?? []);
        const events = (span.events ?? []).map((event) => ({
          name: event.name ?? "event",
          time: nanosToIso(event.timeUnixNano),
          attributes: toObject(event.attributes ?? []),
        }));

        spans.push({
          trace_id: fromHex(span.traceId),
          span_id: fromHex(span.spanId),
          parent_span_id: span.parentSpanId ? fromHex(span.parentSpanId) : null,
          name: span.name ?? "unnamed_span",
          start_time: nanosToIso(span.startTimeUnixNano),
          end_time: nanosToIso(span.endTimeUnixNano),
          start_time_unix_nano: span.startTimeUnixNano ?? "0",
          end_time_unix_nano: span.endTimeUnixNano ?? "0",
          duration_ms: nanosToDurationMs(span.startTimeUnixNano, span.endTimeUnixNano),
          status: spanStatus(span.status?.code),
          attributes: JSON.stringify(attributes),
          events: JSON.stringify(events),
          resource: JSON.stringify(resource),
          agent_id: extractAgentId(attributes),
          framework: extractFramework(attributes),
          project_id: extractProjectId(attributes, resource),
          numericCostUsd: extractCost(attributes),
        });
      }
    }
  }

  const summaries = new Map<string, TraceSummary>();

  for (const span of spans) {
    const existing = summaries.get(span.trace_id);

    if (!existing) {
      summaries.set(span.trace_id, {
        traceId: span.trace_id,
        projectId: span.project_id,
        rootSpanName: span.parent_span_id ? null : span.name,
        startedAt: span.start_time,
        endedAt: span.end_time,
        durationMs: span.duration_ms,
        status: span.status,
        frameworks: span.framework ? [span.framework] : [],
        agentCount: span.agent_id === "unknown" ? 0 : 1,
        spanCount: 1,
        totalCostUsd: span.numericCostUsd,
      });
      continue;
    }

    if (span.start_time < existing.startedAt) {
      existing.startedAt = span.start_time;
    }

    if (span.end_time > existing.endedAt) {
      existing.endedAt = span.end_time;
    }

    existing.durationMs = Math.max(existing.durationMs, span.duration_ms);
    existing.status =
      existing.status === "error" || span.status === "error"
        ? "error"
        : existing.status === "ok" || span.status === "ok"
          ? "ok"
          : "unset";
    existing.frameworks = Array.from(new Set([...existing.frameworks, span.framework].filter(Boolean)));
    existing.spanCount += 1;
    existing.totalCostUsd += span.numericCostUsd;
  }

  for (const [traceId, summary] of summaries.entries()) {
    const agentIds = new Set(
      spans
        .filter((span) => span.trace_id === traceId)
        .map((span) => span.agent_id)
        .filter((agentId) => agentId && agentId !== "unknown"),
    );

    summary.agentCount = agentIds.size;

    if (!summary.rootSpanName) {
      const rootSpan = spans.find(
        (span) => span.trace_id === traceId && (!span.parent_span_id || span.parent_span_id.length === 0),
      );
      summary.rootSpanName = rootSpan?.name ?? null;
    }

    const traceSpans = spans.filter((span) => span.trace_id === traceId);
    const startedAtUnixNano = traceSpans.reduce(
      (earliest, span) => {
        const value = BigInt(span.start_time_unix_nano);
        return value < earliest ? value : earliest;
      },
      BigInt(traceSpans[0]?.start_time_unix_nano ?? "0"),
    );
    const endedAtUnixNano = traceSpans.reduce(
      (latest, span) => {
        const value = BigInt(span.end_time_unix_nano);
        return value > latest ? value : latest;
      },
      BigInt(traceSpans[0]?.end_time_unix_nano ?? "0"),
    );

    summary.durationMs = Math.max(0, Number(endedAtUnixNano - startedAtUnixNano) / 1_000_000);
  }

  return {
    spans,
    summaries: [...summaries.values()],
  };
};
