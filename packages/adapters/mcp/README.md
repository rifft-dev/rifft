# rifft-mcp

MCP adapter for [Rifft](https://github.com/rifft-dev/rifft).

`rifft-mcp` instruments MCP tool calls so they appear as `tool.call` spans in Rifft with request, response, duration, and propagated trace context.

## Install

```bash
pip install rifft-sdk rifft-mcp
```

## Usage

```python
import rifft
from rifft.adapters.mcp import instrument_mcp_client

rifft.init(service_name="my-mcp-app")
instrument_mcp_client(my_session)
```

Then use your MCP client normally and view the resulting trace in Rifft.
