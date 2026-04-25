# @codespar/mcp-chargebee

> MCP server for **Chargebee** — global subscription billing orchestration

[![npm](https://img.shields.io/npm/v/@codespar/mcp-chargebee)](https://www.npmjs.com/package/@codespar/mcp-chargebee)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Why Chargebee in the CodeSpar catalog?

Chargebee is **subscription-billing orchestration on top of** payment gateways (Stripe, Adyen, Braintree, local LatAm acquirers). It handles plans, proration, dunning, tax, and revenue recognition — the SaaS monetization layer, not the card-processing layer.

The CodeSpar catalog already ships **Vindi** and **Iugu** for Brazil-native recurring billing. Chargebee complements (not overlaps) those: it is the global-SaaS pattern used by Platzi, Truora, and most US SaaS selling into LatAm. Zero feature overlap, different market.

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chargebee": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-chargebee"],
      "env": {
        "CHARGEBEE_SITE": "your-site",
        "CHARGEBEE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add chargebee -- npx @codespar/mcp-chargebee
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "chargebee": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-chargebee"],
      "env": {
        "CHARGEBEE_SITE": "your-site",
        "CHARGEBEE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools (15)

| Tool | Purpose |
|---|---|
| `create_subscription` | Create a new subscription in Chargebee. |
| `retrieve_subscription` | Retrieve a subscription by ID |
| `update_subscription` | Update a subscription. |
| `cancel_subscription` | Cancel a subscription. |
| `reactivate_subscription` | Reactivate a cancelled or paused subscription |
| `list_subscriptions` | List subscriptions. |
| `create_customer` | Create a customer in Chargebee. |
| `retrieve_customer` | Retrieve a customer by ID |
| `update_customer` | Update a customer. |
| `list_customers` | List customers. |
| `retrieve_invoice` | Retrieve an invoice by ID |
| `list_invoices` | List invoices with optional filters |
| `create_payment_source_using_token` | Attach a payment source to a customer using a gateway token (e.g. |
| `delete_payment_source` | Delete a payment source |
| `list_events` | List webhook events. |

## Authentication

Chargebee API v2 uses HTTP Basic with your API key as username and empty password. This package handles it automatically — just set `CHARGEBEE_API_KEY`.

Request bodies are sent as `application/x-www-form-urlencoded` (Chargebee's v2 convention). Nested objects and arrays are flattened to `parent[child]=value` / `parent[0][child]=value`.

## Filter syntax

Chargebee uses `field[operator]=value` for list filters, e.g. `status[is]=active`, `email[is]=foo@bar.com`, `occurred_at[after]=1700000000`.

Pass these via the `filters` object on any `list_*` tool:

```json
{
  "filters": {
    "status[is]": "active",
    "plan_id[is]": "pro-monthly"
  }
}
```

Common list filters are also exposed as top-level conveniences (e.g. `list_invoices` accepts `customer_id`, `status` directly).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHARGEBEE_SITE` | Yes | Site subdomain, e.g. `acme-test` for `acme-test.chargebee.com` |
| `CHARGEBEE_API_KEY` | Yes | API key from Settings > API Keys (full-access or restricted) |

## Sandbox / Testing

Every Chargebee account includes a free **test site** (`<your-site>-test.chargebee.com`). Use its API key for development — no charges flow to real gateways.

### Get your credentials

1. Sign up at [chargebee.com](https://www.chargebee.com)
2. Your test site is created automatically (`<name>-test`)
3. Go to Settings > API Keys and create a Full-Access or Read-Only key
4. Set `CHARGEBEE_SITE` and `CHARGEBEE_API_KEY`

## Roadmap

### v0.2 (planned)
- `create_invoice` — charge a customer outside of a subscription
- `record_payment` — record offline payments
- `create_coupon` / `list_coupons`
- `create_plan` / `list_plans` / `create_addon`
- `list_transactions`

### v0.3 (planned)
- `create_hosted_page_checkout` — generate Chargebee hosted checkout URLs
- `retrieve_quote` / `convert_quote`
- Revenue reporting helpers

Want a tool sooner? [Open an issue](https://github.com/codespar/mcp-dev-brasil/issues) or [PR](https://github.com/codespar/mcp-dev-brasil).

## Links

- [Chargebee website](https://www.chargebee.com)
- [Chargebee API docs](https://apidocs.chargebee.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent-initiated subscription changes? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
