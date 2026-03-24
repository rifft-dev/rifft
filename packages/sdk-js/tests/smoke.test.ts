import test from "node:test";
import assert from "node:assert/strict";

type MockFetchCall = {
  url: string;
  init?: RequestInit;
};

const loadSdk = async () => {
  const modulePath = new URL(`../src/index.ts?cacheBust=${Date.now()}`, import.meta.url).href;
  return import(modulePath);
};

test("trace batches nested spans into one export", async () => {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ partialSuccess: {} }), { status: 202 });
  }) as typeof fetch;

  try {
    const sdk = await loadSdk();
    sdk.init({ project_id: "default", endpoint: "http://localhost:4318" });

    const runAgent = sdk.trace({ agent_id: "researcher", framework: "custom" })(async (query: string) => {
      return sdk.withSpan("tool.call", { agent_id: "researcher", framework: "custom" }, async (span: any) => {
        span.setAttribute("tool.name", "web_search");
        span.setAttribute("tool.input", query);
        return { ok: true };
      });
    });

    await runAgent("collector smoke");

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body));
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    assert.equal(spans.length, 2);
    assert.equal(spans[0].status.code, 1);
    assert.equal(spans[1].status.code, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("trace records exceptions as error spans", async () => {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ partialSuccess: {} }), { status: 202 });
  }) as typeof fetch;

  try {
    const sdk = await loadSdk();
    sdk.init({ project_id: "default", endpoint: "http://localhost:4318" });

    const failingAgent = sdk.trace({ agent_id: "writer", framework: "custom" })(() => {
      throw new Error("boom");
    });

    await assert.rejects(async () => failingAgent(), /boom/);

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body));
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    assert.equal(span.status.code, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
