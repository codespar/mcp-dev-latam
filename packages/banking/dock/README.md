# @codespar/mcp-dock

> MCP server for **Dock** — Brazilian Banking-as-a-Service (accounts, Pix, card issuing) for fintechs and embedded-finance products

[![npm](https://img.shields.io/npm/v/@codespar/mcp-dock)](https://www.npmjs.com/package/@codespar/mcp-dock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Why Dock

Dock is one of the two dominant BaaS providers in Brazil. Together with Matera, they power most BR fintechs.

**Matera vs Dock — pick one, same commerce patterns:**

| | Matera | Dock |
|---|---|---|
| Core strength | Pix-focused core banking | Broader BaaS: accounts + Pix + **card issuing** |
| Historical root | Core-banking platform | Card-issuing platform that expanded into accounts + Pix |
| Typical customer | Fintech building on top of Pix | Fintech / retailer issuing branded cards + accounts |
| Pix Automático | Live (2025 BCB product) | Roadmap |

BR fintechs usually pick one based on contract terms and pricing. **Agents building fintech products can target both — the commerce patterns are identical; only the vendor relationship changes.** This server exposes Dock's surface in the same shape as `@codespar/mcp-matera` so an agent can swap backends without rewriting tool-call logic.

Use Dock when an agent needs to:
- Spin up **digital accounts** for end users (CPF holders)
- Move money via Pix (charges, transfers, DICT, refunds)
- **Issue cards** (debit / credit / prepaid / virtual) against those accounts — Dock's key differentiator

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dock": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-dock"],
      "env": {
        "DOCK_CLIENT_ID": "your-client-id",
        "DOCK_CLIENT_SECRET": "your-client-secret",
        "DOCK_ENV": "sandbox"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add dock -- npx @codespar/mcp-dock
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "dock": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-dock"],
      "env": {
        "DOCK_CLIENT_ID": "your-client-id",
        "DOCK_CLIENT_SECRET": "your-client-secret",
        "DOCK_ENV": "sandbox"
      }
    }
  }
}
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_account` | Create a digital account for an end user (CPF holder) on Dock. |
| `get_account` | Retrieve a Dock account by id. |
| `send_pix` | Initiate an outbound Pix transfer from a Dock account to any Pix key in BR. |
| `get_pix` | Retrieve an outbound Pix payment by endToEndId. |
| `create_pix_qr_static` | Create a static Pix QR (reusable, tied to a merchant Pix key). |
| `create_pix_qr_dynamic` | Create a dynamic Pix QR (single-use, expiring). |
| `refund_pix` | Refund (devolução) a Pix payment. |
| `resolve_dict_key` | Resolve a Pix DICT key to the account holder's identity and ISPB/branch/account. |
| `issue_card` | Issue a card (debit / credit / prepaid / virtual) against a Dock account. |
| `get_card` | Retrieve a card by id. |
| `list_accounts` | List Dock accounts under the merchant. |
| `freeze_account` | Freeze (block) a Dock account. |
| `unfreeze_account` | Unfreeze a previously frozen Dock account, restoring Pix and card operations. |
| `block_card` | Block a card temporarily (reversible). |
| `unblock_card` | Unblock a card that was previously blocked (reversible). |
| `change_card_status` | Change a card's lifecycle status: ACTIVE / BLOCKED / CANCELED. |
| `list_transactions` | List transactions on a Dock account (Pix in/out, card auths, fees, transfers). |
| `get_transaction` | Retrieve a single transaction by id. |
| `create_webhook` | Register a webhook endpoint to receive Dock event notifications (account.*, pix.*, card.*, transaction.*). |
| `list_webhooks` | List all webhook endpoints registered for the merchant. |

## Authentication

OAuth 2.0 Client Credentials. The server calls `POST /oauth/token` with Basic auth (`client_id:client_secret`) and caches the bearer token in memory until a minute before expiry.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DOCK_CLIENT_ID` | Yes | OAuth2 client_id issued by Dock |
| `DOCK_CLIENT_SECRET` | Yes | OAuth2 client_secret (secret) |
| `DOCK_ENV` | No | `sandbox` (default) or `production` |

Base URL is derived from `DOCK_ENV`: `https://sandbox.api.dock.tech` (sandbox) or `https://api.dock.tech` (production).

## Status

**v0.1.0-alpha.1 — tool surface is stable, wire paths are NOT yet verified.**

Dock's developer portal at [developers.dock.tech](https://developers.dock.tech) redirects to a ReadMe.com login gate. Public docs are not accessible without a Dock merchant contract, so on 2026-04-21 we could not validate the exact URL paths.

The endpoint paths in `src/index.ts` follow **standard BR BaaS conventions** (matching Matera's shape and the BCB Pix spec) and are best-guesses. Known-suspect items are flagged inline with `TODO(verify)` comments:

| Area | Value in code | Why it's suspect |
|------|---------------|------------------|
| Token endpoint | `POST /oauth/token` | Standard candidate, but `/oauth2/token` or `/auth/v1/token` also common |
| Pix refund | `POST /pix/payments/{e2eid}/refund` | BCB spec names refunds `/pix/{e2eid}/devolucao/{id}` |
| DICT lookup | `GET /pix/dict/{key}` | BCB DICT is RSFN-gated; Dock's wrapper path unverified |

The 10 tool **names** and **input schemas** above are the public contract and will remain stable. Only the internal HTTP calls in `src/index.ts` will change when we verify against the sandbox. Using this server against a live Dock tenant today may produce 404s on most calls.

PR welcome from anyone with a Dock sandbox.

## Roadmap

### v0.2 (planned)
- Verified paths against Dock sandbox
- Card controls: `block_card`, `unblock_card`, `set_card_limits`
- Account statements and transaction listings
- Webhook event helpers

### v0.3 (planned)
- Boleto issuance
- TED / bank transfers (non-Pix rails)
- Credit underwriting endpoints (Dock's credit stack)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Dock](https://www.dock.tech)
- [Dock Developers](https://developers.dock.tech) (gated — requires merchant login)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent-initiated bank transfers and card issuance? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
