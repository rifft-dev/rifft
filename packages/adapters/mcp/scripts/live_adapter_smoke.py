from __future__ import annotations

import json
import sys
from pathlib import Path

SDK_SRC = Path(__file__).resolve().parents[3] / "sdk-python" / "src"
ADAPTER_SRC = Path(__file__).resolve().parents[1] / "src"

for path in (str(SDK_SRC), str(ADAPTER_SRC)):
    if path not in sys.path:
        sys.path.insert(0, path)

import rifft
from rifft.adapters.mcp import instrument_mcp_client


class FakeMcpClient:
    def call_tool(self, name: str, arguments: dict[str, object] | None = None, **kwargs):
        return {
            "server": "local-mcp",
            "tool": name,
            "arguments": arguments,
            "headers": kwargs.get("headers", {}),
            "result": {"hits": 3, "top_doc": "collector gRPC smoke"},
        }


def main() -> None:
    rifft.init(project_id="default", endpoint="http://localhost:4318")

    marker = "mcp-python-adapter-smoke"
    client = instrument_mcp_client(FakeMcpClient(), agent_id="researcher", framework="custom", server_name="local-mcp")

    with rifft.span("mcp.python.smoke.root", agent_id="researcher", framework="custom") as root_span:
        root_span.set_attribute("smoke.marker", marker)
        result = client.call_tool("search_docs", {"query": "collector grpc ingest"})
        root_span.set_attribute("tool.result_preview", result["result"]["top_doc"])

    provider = rifft.get_tracer_provider()
    if hasattr(provider, "force_flush"):
        provider.force_flush()

    print(json.dumps({"marker": marker, "result": result}, indent=2))


if __name__ == "__main__":
    main()
