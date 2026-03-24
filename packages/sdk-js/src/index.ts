import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

type InitOptions = {
  project_id: string;
  endpoint: string;
  api_key?: string;
};

type Framework = "crewai" | "autogen" | "custom";

type TraceOptions = {
  agent_id: string;
  framework?: Framework;
  span_name?: string;
};

type DecisionPayload = {
  system_prompt: string;
  conversation_history: unknown[];
  available_tools: string[];
  chosen_action: string;
  reasoning?: string;
};

type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

type SpanStatus = "unset" | "ok" | "error";

type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Map<string, AttributeValue>;
  events: Array<{ name: string; timeUnixNano: string; attributes: Map<string, AttributeValue> }>;
  status: SpanStatus;
};

type TraceState = {
  traceId: string;
  spans: SpanRecord[];
  openSpanCount: number;
  exportPromise: Promise<void> | null;
};

type ExecutionContext = {
  trace: TraceState;
  currentSpanId: string;
  currentAgentId: string;
  currentFramework: Framework;
};

export type RifftSpan = {
  setAttribute: (key: string, value: unknown) => void;
  captureDecision: (payload: DecisionPayload) => void;
  addEvent: (name: string, attributes?: Record<string, unknown>) => void;
  end: () => Promise<void>;
  run: <T>(callback: () => T | Promise<T>) => T | Promise<T>;
};

const storage = new AsyncLocalStorage<ExecutionContext>();
let config: InitOptions | null = null;

const nowUnixNano = () => BigInt(Math.round((performance.timeOrigin + performance.now()) * 1_000_000)).toString();

const normalizeEndpoint = (endpoint: string) =>
  endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1/traces`;

const requireConfig = () => {
  if (!config) {
    throw new Error("rifft.init(...) must be called before tracing spans.");
  }

  return config;
};

const sanitizeValue = (value: unknown): AttributeValue => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 2048 ? `${value.slice(0, 2048)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    ) as { [key: string]: AttributeValue };
  }

  return String(value);
};

const toOtlpValue = (value: AttributeValue): Record<string, unknown> => {
  if (value === null) {
    return { stringValue: "null" };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { boolValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toOtlpValue(entry)),
      },
    };
  }

  return {
    kvlistValue: {
      values: Object.entries(value).map(([key, entry]) => ({
        key,
        value: toOtlpValue(entry),
      })),
    },
  };
};

const toKeyValues = (attributes: Map<string, AttributeValue>) =>
  [...attributes.entries()].map(([key, value]) => ({
    key,
    value: toOtlpValue(value),
  }));

const exportTrace = async (trace: TraceState) => {
  const currentConfig = requireConfig();
  const response = await fetch(normalizeEndpoint(currentConfig.endpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(currentConfig.api_key ? { authorization: `Bearer ${currentConfig.api_key}` } : {}),
    },
    body: JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "rifft-sdk-js" } },
              { key: "project_id", value: { stringValue: currentConfig.project_id } },
            ],
          },
          scopeSpans: [
            {
              spans: trace.spans.map((span) => ({
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId ?? undefined,
                name: span.name,
                startTimeUnixNano: span.startTimeUnixNano,
                endTimeUnixNano: span.endTimeUnixNano ?? span.startTimeUnixNano,
                attributes: toKeyValues(span.attributes),
                events: span.events.map((event) => ({
                  name: event.name,
                  timeUnixNano: event.timeUnixNano,
                  attributes: toKeyValues(event.attributes),
                })),
                status: {
                  code: span.status === "ok" ? 1 : span.status === "error" ? 2 : 0,
                },
              })),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`rifft exporter failed: ${response.status} ${await response.text()}`);
  }
};

class SpanHandle implements RifftSpan {
  private readonly record: SpanRecord;
  private readonly trace: TraceState;
  private readonly context: ExecutionContext;
  private ended = false;

  constructor(name: string, options: TraceOptions) {
    const currentContext = storage.getStore();
    const framework = options.framework ?? currentContext?.currentFramework ?? "custom";
    const trace =
      currentContext?.trace ??
      ({
        traceId: randomBytes(16).toString("hex"),
        spans: [],
        openSpanCount: 0,
        exportPromise: null,
      } satisfies TraceState);

    this.trace = trace;
    this.record = {
      traceId: trace.traceId,
      spanId: randomBytes(8).toString("hex"),
      parentSpanId: currentContext?.currentSpanId,
      name,
      startTimeUnixNano: nowUnixNano(),
      attributes: new Map<string, AttributeValue>([
        ["agent_id", sanitizeValue(options.agent_id)],
        ["framework", sanitizeValue(framework)],
        ["project_id", sanitizeValue(requireConfig().project_id)],
      ]),
      events: [],
      status: "unset",
    };
    this.context = {
      trace,
      currentSpanId: this.record.spanId,
      currentAgentId: options.agent_id,
      currentFramework: framework,
    };

    this.trace.spans.push(this.record);
    this.trace.openSpanCount += 1;
  }

  setAttribute(key: string, value: unknown) {
    this.record.attributes.set(key, sanitizeValue(value));
  }

  captureDecision(payload: DecisionPayload) {
    this.setAttribute("rifft.decision", payload);
  }

  addEvent(name: string, attributes: Record<string, unknown> = {}) {
    this.record.events.push({
      name,
      timeUnixNano: nowUnixNano(),
      attributes: new Map(
        Object.entries(attributes).map(([key, value]) => [key, sanitizeValue(value)]),
      ),
    });
  }

  async end() {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.record.endTimeUnixNano = nowUnixNano();
    if (this.record.status === "unset") {
      this.record.status = "ok";
    }

    this.trace.openSpanCount -= 1;
    if (this.trace.openSpanCount === 0 && !this.trace.exportPromise) {
      this.trace.exportPromise = exportTrace(this.trace);
      await this.trace.exportPromise;
    }
  }

  run<T>(callback: () => T | Promise<T>) {
    return storage.run(this.context, () => {
      try {
        const result = callback();
        if (result instanceof Promise) {
          return result.then(
            async (value) => {
              await this.end();
              return value;
            },
            async (error) => {
              this.record.status = "error";
              this.setAttribute("exception.type", error instanceof Error ? error.name : "Error");
              this.setAttribute(
                "exception.message",
                error instanceof Error ? error.message : String(error),
              );
              await this.end();
              throw error;
            },
          ) as T | Promise<T>;
        }

        void this.end();
        return result;
      } catch (error) {
        this.record.status = "error";
        this.setAttribute("exception.type", error instanceof Error ? error.name : "Error");
        this.setAttribute("exception.message", error instanceof Error ? error.message : String(error));
        void this.end();
        throw error;
      }
    });
  }
}

export const init = (options: InitOptions) => {
  config = options;
};

export const trace = (options: TraceOptions) => {
  return function traceDecorator<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>) => {
      const functionName = fn.name && fn.name.length > 0 ? fn.name : "anonymous";
      const rifftSpan = span(options.span_name ?? functionName, options);
      rifftSpan.setAttribute("code.function", functionName);
      rifftSpan.setAttribute("rifft.function.args", args);
      const result = rifftSpan.run(() => fn(...args));

      if (result instanceof Promise) {
        return result.then((value) => {
          rifftSpan.setAttribute("rifft.return_type", value === null ? "null" : typeof value);
          return value;
        }) as ReturnType<T>;
      }

      rifftSpan.setAttribute(
        "rifft.return_type",
        result === null ? "null" : Array.isArray(result) ? "array" : typeof result,
      );
      return result;
    }) as T;
  };
};

export const span = (name: string, options: TraceOptions): RifftSpan => new SpanHandle(name, options);

export const withSpan = <T>(
  name: string,
  options: TraceOptions,
  callback: (spanHandle: RifftSpan) => T | Promise<T>,
) => {
  const rifftSpan = span(name, options);
  return rifftSpan.run(() => callback(rifftSpan));
};

export const getConfig = () => config;

export const getCurrentAgentId = () => storage.getStore()?.currentAgentId ?? null;

export const getCurrentFramework = () => storage.getStore()?.currentFramework ?? null;

export const getCurrentTraceContext = () => {
  const current = storage.getStore();
  if (!current) {
    return null;
  }

  return {
    traceId: current.trace.traceId,
    spanId: current.currentSpanId,
  };
};
