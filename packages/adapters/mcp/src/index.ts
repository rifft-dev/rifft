import { getCurrentAgentId, getCurrentTraceContext, withSpan } from "rifft";

export type McpToolSpan = {
  "mcp.tool_name": string;
  "mcp.server_name": string;
  "mcp.input": string;
  "mcp.output": string;
  "mcp.duration_ms": number;
};

type InstrumentOptions = {
  agent_id?: string;
  framework?: "custom" | "crewai" | "autogen";
  server_name?: string;
};

type CallToolArgs = {
  name?: string;
  toolName?: string;
  params?: unknown;
  arguments?: unknown;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

type CallToolClient = {
  callTool?: (...args: any[]) => Promise<any> | any;
  call_tool?: (...args: any[]) => Promise<any> | any;
};

const truncate = (value: string, max = 10_240) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const toJson = (value: unknown) => {
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
};

const toTraceparent = (traceId: string, spanId: string) => `00-${traceId}-${spanId}-01`;

const injectTraceHeaders = (payload: unknown) => {
  const context = getCurrentTraceContext();
  if (!context || !payload || typeof payload !== "object") {
    return payload;
  }

  const traceparent = toTraceparent(context.traceId, context.spanId);
  if (Array.isArray(payload)) {
    return payload;
  }

  const clone = { ...(payload as Record<string, unknown>) };

  if ("headers" in clone && clone.headers && typeof clone.headers === "object") {
    clone.headers = {
      ...(clone.headers as Record<string, string>),
      traceparent,
      "x-rifft-traceparent": traceparent,
    };
    return clone;
  }

  clone.headers = {
    traceparent,
    "x-rifft-traceparent": traceparent,
  };
  return clone;
};

const extractToolName = (args: unknown[]) => {
  const [firstArg, secondArg] = args;
  if (typeof firstArg === "string") {
    return firstArg;
  }

  if (firstArg && typeof firstArg === "object") {
    const candidate = firstArg as CallToolArgs;
    return candidate.name ?? candidate.toolName ?? "unknown_tool";
  }

  if (secondArg && typeof secondArg === "object") {
    const candidate = secondArg as CallToolArgs;
    return candidate.name ?? candidate.toolName ?? "unknown_tool";
  }

  return "unknown_tool";
};

const extractInput = (args: unknown[]) => {
  const [firstArg, secondArg] = args;

  if (typeof firstArg === "string") {
    return secondArg ?? null;
  }

  if (firstArg && typeof firstArg === "object") {
    const candidate = firstArg as CallToolArgs;
    return candidate.params ?? candidate.arguments ?? firstArg;
  }

  return secondArg ?? null;
};

const patchMethod = (
  client: CallToolClient,
  methodName: "callTool" | "call_tool",
  options: InstrumentOptions,
) => {
  const original = client[methodName];
  if (typeof original !== "function" || (original as any).__rifft_wrapped__) {
    return;
  }

  const wrapped = async (...args: unknown[]) => {
    const toolName = extractToolName(args);
    const input = extractInput(args);
    const agentId = options.agent_id ?? getCurrentAgentId() ?? "mcp-client";
    const framework = options.framework ?? "custom";
    const serverName = options.server_name ?? "mcp-server";
    const nextArgs = [...args];

    if (typeof nextArgs[0] === "object" && nextArgs[0] !== null) {
      nextArgs[0] = injectTraceHeaders(nextArgs[0]);
    } else if (nextArgs.length > 1) {
      nextArgs[1] = injectTraceHeaders(nextArgs[1]);
    }

    return withSpan("tool.call", { agent_id: agentId, framework }, async (toolSpan) => {
      toolSpan.setAttribute("tool.name", toolName);
      toolSpan.setAttribute("tool.input", input);
      toolSpan.setAttribute("mcp.tool_name", toolName);
      toolSpan.setAttribute("mcp.server_name", serverName);
      toolSpan.setAttribute("mcp.input", toJson(input));

      const startedAt = performance.now();
      const result = await original(...nextArgs);
      const durationMs = performance.now() - startedAt;

      toolSpan.setAttribute("tool.output", result);
      toolSpan.setAttribute("mcp.output", toJson(result));
      toolSpan.setAttribute("mcp.duration_ms", durationMs);
      return result;
    });
  };

  (wrapped as any).__rifft_wrapped__ = true;
  client[methodName] = wrapped;
};

export const createMcpSpan = (span: McpToolSpan) => span;

export const instrumentMcpClient = <T extends CallToolClient>(client: T, options: InstrumentOptions = {}) => {
  patchMethod(client, "callTool", options);
  patchMethod(client, "call_tool", options);
  return client;
};
