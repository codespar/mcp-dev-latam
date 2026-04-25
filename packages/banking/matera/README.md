# @codespar/mcp-matera

> MCP server for **Matera** — Brazilian core-banking infrastructure (BaaS) for fintechs building on top of Pix, DICT, and Pix Automático

[![npm](https://img.shields.io/npm/v/@codespar/mcp-matera)](https://www.npmjs.com/package/@codespar/mcp-matera)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Why Matera

Matera is **core-banking infrastructure**, not a PSP. Per vendor case studies it processes roughly 10% of Brazil's Pix transactions. Its customer is a **fintech building on top of Pix** — issuing accounts, moving money through DICT, registering Pix Automático agreements — **not a merchant accepting Pix** (that's what Zoop / Asaas / Mercado Pago are for).

This opens a segment in the CodeSpar catalog distinct from PSP servers: **fintech-building-on-top-of-Pix**. Matera sits under `banking` alongside Stark Bank and Open Finance, not under `payments`.

Use Matera when an agent needs to:
- Spin up Pix charges against accounts the fintech itself issued
- Do DICT lookups to resolve a Pix key before moving money
- Register recurring **Pix Automático** agreements (BCB 2025 product — few providers are live with this)
- Move money bank-to-bank through the fintech's own Matera rails

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "matera": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-matera"],
      "env": {
        "MATERA_CLIENT_ID": "your-client-id",
        "MATERA_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add matera -- npx @codespar/mcp-matera
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "matera": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-matera"],
      "env": {
        "MATERA_CLIENT_ID": "your-client-id",
        "MATERA_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_pix_charge_static` | Create a static Pix charge (reusable QR code tied to a merchant Pix key). |
| `create_pix_charge_dynamic` | Create a dynamic Pix charge (single-use QR with expiration). |
| `get_pix_charge` | Retrieve a Pix charge (static or dynamic) by txid. |
| `list_pix_charges` | List immediate Pix charges (BCB /cob) with date and status filters. |
| `update_pix_charge` | Update an immediate Pix charge (BCB PATCH /cob/{txid}). |
| `create_pix_charge_due` | Create a due-dated Pix charge (BCB /cobv — Pix com Vencimento). |
| `get_pix_charge_due` | Retrieve a due-dated Pix charge (BCB GET /cobv/{txid}). |
| `create_pix_payment` | Initiate an outbound Pix transfer (ordem de pagamento). |
| `get_pix_payment` | Retrieve an outbound Pix payment by endToEndId. |
| `refund_pix_payment` | Refund (devolução) a Pix payment. |
| `list_pix_payments` | List outbound Pix payments with optional filters. |
| `list_pix_received` | List inbound Pix (Pix recebidos) credited to merchant accounts in a date range. |
| `resolve_pix_key` | Resolve a Pix DICT key to the account holder's identity and ISPB/branch/account. |
| `list_dict_keys` | List DICT keys registered to the merchant's accounts on Matera. |
| `register_dict_key` | Register (claim) a DICT key for a merchant account on Matera. |
| `delete_dict_key` | Delete a DICT key the merchant owns. |
| `create_pix_automatico` | Register a Pix Automático recurrence (BCB 2025 recurring Pix product, /rec). |
| `get_pix_automatico` | Retrieve a Pix Automático recurrence by idRec. |
| `cancel_pix_automatico` | Cancel an active Pix Automático recurrence. |
| `get_account_balance` | Get the current balance of a Matera-managed account. |
| `get_account_statement` | Get the statement (extrato) of a Matera-managed account in a date range. |
| `internal_transfer` | Book a transfer between two accounts both held on Matera (TED-interno / transferência interna). |

## Authentication

Matera's public doc index states that **server integration uses `secret-key` + `data-signature` headers**, while **OAuth2 is scoped to mobile / web-UI integrations** ([doc-api.matera.com](https://doc-api.matera.com/)). The v0.1-alpha scaffold currently implements the OAuth2 client-credentials path against `POST /auth/token`. That pairing is almost certainly wrong for server-to-server use and will be replaced with the signed-request scheme once we can validate against a live sandbox — see the "Status" section below.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MATERA_CLIENT_ID` | Yes | OAuth2 client_id issued by Matera |
| `MATERA_CLIENT_SECRET` | Yes | OAuth2 client_secret (secret) |
| `MATERA_BASE_URL` | No | API base URL. Defaults to `https://api.matera.com`. Sandbox URL varies per product line — ask your Matera contact. |

## Status

**v0.1.0-alpha.1 — tool surface is stable, wire paths are NOT yet verified.**

On 2026-04-24 we attempted to validate every endpoint path against `doc-api.matera.com`. The doc site is reachable in a browser but could not be fetched from our automation environment (DNS / network-gated; no login wall observed). Public search snippets and third-party references confirm the product surface (Pix charges, Pix payments, DICT, Pix Automático) and the authentication model (server = `secret-key` + `data-signature`; OAuth2 = end-user only) but do **not** surface the exact URL paths.

Until we can run the server against a live Matera sandbox, the following remain **assumed, not verified**:

| Area | Value in code | Why it's suspect |
|------|---------------|------------------|
| Token endpoint | `POST /auth/token` (Basic auth, `grant_type=client_credentials`) | Likely wrong for server integration — see Authentication |
| Pix charges | `/pix/charges/static`, `/pix/charges/dynamic`, `/pix/charges/{txid}` | Matera likely follows BCB's `/cob` (immediate) / `/cobv` (dated) naming |
| Pix payments | `/pix/payments`, `/pix/payments/{e2eid}`, `/pix/payments/{e2eid}/refund` | BCB spec names refunds `/pix/{e2eid}/devolucao/{id}` |
| DICT lookup | `GET /pix/dict/{key}`, `GET /pix/dict/keys` | BCB DICT is RSFN-gated; Matera exposes its own wrapper. Exact path unknown. |
| Pix Automático | `POST /pix/automatico` | Almost certainly a placeholder. BCB 2025 spec uses `POST /rec` (recurrence) + `/cobr/{txid}` (recurring charge). |

The 10 tool **names** and **input schemas** above are the public contract and will remain stable. Only the internal HTTP calls in `src/index.ts` will change when we verify against the sandbox. Using this server against a live Matera tenant today will produce 404s on most calls.

Track the verification work in the repo issues; PR welcome from anyone with a Matera sandbox.

## Roadmap

### v0.2 (planned)
- Signed-request auth path (`secret-key` + `data-signature`) for endpoints that require it
- Account opening (abertura de conta) — Matera IB product
- TED / bank transfers (non-Pix rails)
- Webhook event helpers

### v0.3 (planned)
- Internet Banking Server tools (statements, balances, card management)
- Boleto issuance
- Pix MED (Mecanismo Especial de Devolução) flow

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Matera](https://matera.com)
- [Matera API Documentation](https://doc-api.matera.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent-initiated bank transfers? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
