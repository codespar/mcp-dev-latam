# @codespar/mcp-melhor-envio

> MCP server for **Melhor Envio** — shipping aggregator with multi-carrier rate comparison

[![npm](https://img.shields.io/npm/v/@codespar/mcp-melhor-envio)](https://www.npmjs.com/package/@codespar/mcp-melhor-envio)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "melhor-envio": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-melhor-envio"],
      "env": {
        "MELHOR_ENVIO_TOKEN": "your-token",
        "MELHOR_ENVIO_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add melhor-envio -- npx @codespar/mcp-melhor-envio
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "melhor-envio": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-melhor-envio"],
      "env": {
        "MELHOR_ENVIO_TOKEN": "your-token",
        "MELHOR_ENVIO_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `calculate_shipping` | Calculate shipping rates from multiple carriers |
| `create_shipment` | Create a shipment order |
| `track_shipment` | Track a shipment by order ID |
| `generate_label` | Generate shipping label for an order |
| `list_agencies` | List carrier pickup agencies near a location |
| `cancel_shipment` | Cancel a shipment order |
| `get_balance` | Get current account balance |
| `add_cart` | Add shipment orders to cart for batch checkout |
| `checkout_cart` | Checkout all items in the cart and pay |
| `preview_label` | Preview a shipping label before generating |
| `print_label` | Print/download label PDF |
| `get_shipment` | Get shipment order details by ID |
| `list_shipments` | List all shipment orders with filters |
| `get_store` | Get store/company information |
| `search_agencies` | Search pickup agencies by service and location |
| `create_address` | Create a stored address for sender/recipient |
| `list_services_available` | List available shipping services for a route |
| `get_tracking_history` | Get complete tracking history with events |

## Authentication

Melhor Envio uses a Bearer token for authentication.

## Sandbox / Testing

Melhor Envio provides a sandbox at `sandbox.melhorenvio.com.br`. Set `MELHOR_ENVIO_SANDBOX=true` to use it.

### Get your credentials

1. Go to [Melhor Envio](https://melhorenvio.com.br)
2. Create an account
3. Navigate to API settings and generate a token
4. Set the `MELHOR_ENVIO_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MELHOR_ENVIO_TOKEN` | Yes | Bearer token from Melhor Envio |
| `MELHOR_ENVIO_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_store` — Create a store in Melhor Envio
- `update_store` — Update store details
- `get_receipt` — Get shipping receipt/label
- `list_companies` — List available shipping companies
- `get_invoice` — Get invoice for a shipment

### v0.3 (planned)
- `batch_shipments` — Create multiple shipments in a single request
- `detailed_reports` — Generate detailed shipping reports
- `webhook_management` — Register, list, and delete webhooks

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Melhor Envio Website](https://melhorenvio.com.br)
- [Melhor Envio API Documentation](https://docs.melhorenvio.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
