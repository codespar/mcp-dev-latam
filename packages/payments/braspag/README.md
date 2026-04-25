# @codespar/mcp-braspag

> MCP server for **Braspag** — Cielo Group's enterprise orchestration layer: multi-acquirer routing, token vault (Cartão Protegido), recurrence, marketplace split, antifraud orchestration.

[![npm](https://img.shields.io/npm/v/@codespar/mcp-braspag)](https://www.npmjs.com/package/@codespar/mcp-braspag)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Braspag vs. Cielo (Acquirer)

CodeSpar ships **two** Cielo Group servers with different business contracts:

| Server | Product | What it is | Who uses it |
|---|---|---|---|
| [`@codespar/mcp-cielo`](../cielo) | Cielo Acquirer | Direct card acquiring rails (credit, debit, boleto, Pix) | Any merchant taking cards through Cielo |
| `@codespar/mcp-braspag` (this) | Braspag / Pagador | Enterprise orchestration on top of any acquirer | Enterprise BR retail (Magalu-tier): multi-acquirer routing, token vault, marketplace split |

Braspag orchestrates **across** acquirers. You keep your Cielo (or Rede, or Stone) acquiring contract and layer Braspag on top for: smart routing, failover, vaulting cards once and reusing across acquirers (**Cartão Protegido**), driving recurrence, and splitting marketplace capture across sub-merchants.

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "braspag": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-braspag"],
      "env": {
        "BRASPAG_MERCHANT_ID": "your-merchant-uuid",
        "BRASPAG_MERCHANT_KEY": "your-merchant-key",
        "BRASPAG_ENV": "sandbox"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add braspag -- npx @codespar/mcp-braspag
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "braspag": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-braspag"],
      "env": {
        "BRASPAG_MERCHANT_ID": "your-merchant-uuid",
        "BRASPAG_MERCHANT_KEY": "your-merchant-key",
        "BRASPAG_ENV": "sandbox"
      }
    }
  }
}
```

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_sale` | Create a sale on the Braspag Transaction API (POST /sales). |
| `capture_sale` | Capture a pre-authorized sale (PUT /sales/{paymentId}/capture). |
| `void_sale` | Void / cancel a sale (PUT /sales/{paymentId}/void). |
| `create_recurrent` | Create a recurrent payment schedule (POST /recurrentPayments). |
| `disable_recurrent` | Deactivate a recurrent payment (PUT /recurrentPayments/{recurrentPaymentId}/Deactivate). |
| `update_recurrent_amount` | Update the charged amount on a recurrent payment (PUT /recurrentPayments/{recurrentPaymentId}/Amount). |
| `get_sale` | Get sale detail by PaymentId (GET /sales/{paymentId} — Query API). |
| `get_sale_by_order_id` | Look up sale(s) by MerchantOrderId (GET /sales?merchantOrderId=X — Query API). |
| `get_recurrent` | Get a recurrent payment's configuration and history (GET /recurrentPayments/{recurrentPaymentId} — Query API). |
| `tokenize_card` | Tokenize a card into the Braspag vault / Cartão Protegido (POST /card). |
| `get_card_token` | Retrieve the stored card data associated with a Cartão Protegido token (GET /card/{token}). |
| `create_split_sale` | Create a sale with marketplace split rules (POST /sales with Payment.SplitPayments). |
| `create_sale_3ds` | Create a 3DS-authenticated credit sale (POST /sales). |
| `create_zero_auth` | Zero-dollar authorization / card validation (POST /zeroauth). |
| `create_boleto_sale` | Convenience wrapper to create a Boleto sale (POST /sales with Payment.Type=Boleto). |
| `create_pix_sale` | Convenience wrapper to create a Pix sale (POST /sales with Payment.Type=Pix). |
| `reactivate_recurrent` | Reactivate a previously deactivated recurrent payment (PUT /recurrentPayments/{recurrentPaymentId}/Reactiva... |
| `update_recurrent_next_payment` | Update the NextPaymentDate on a recurrent payment (PUT /recurrentPayments/{recurrentPaymentId}/NextPaymentD... |
| `update_recurrent_payment` | Update the Payment (CreditCard + Customer) on a recurrent schedule (PUT /recurrentPayments/{recurrentPaymen... |
| `create_antifraud_analysis` | Submit a standalone Antifraud analysis (POST /fraudanalysis) through Braspag's antifraud orchestration (Cyb... |
| `delete_card_token` | Delete a Cartão Protegido vault token (DELETE /card/{token}). |
| `create_split_capture` | Capture a previously authorized split sale with overridden per-sub-merchant amounts (PUT /sales/{paymentId}... |

## Authentication

Braspag uses `MerchantId` (UUID) and `MerchantKey` (secret) headers on both the Transaction API and the Query API.

## Environments

| Env | Transaction API | Query API |
|-----|-----------------|-----------|
| `sandbox` (default) | `https://apisandbox.braspag.com.br/v2` | `https://apiquerysandbox.braspag.com.br/v2` |
| `production` | `https://api.braspag.com.br/v2` | `https://apiquery.braspag.com.br/v2` |

Set via `BRASPAG_ENV=production` to switch.

### Get your credentials

1. Reach out to your Cielo / Braspag account team to enable Braspag Pagador on your merchant contract.
2. Receive your MerchantId (UUID) and MerchantKey.
3. Set the environment variables below.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRASPAG_MERCHANT_ID` | Yes | Merchant UUID |
| `BRASPAG_MERCHANT_KEY` | Yes | Merchant secret key |
| `BRASPAG_ENV` | No | `sandbox` (default) or `production` |

## Roadmap

### v0.2 (planned)
- `create_sale_with_card_token` — convenience wrapper that uses a Cartão Protegido token
- `delete_card_token` — revoke a vault token
- `get_sale_antifraud` — Query API antifraud detail
- `update_recurrent_payment` — update non-amount fields on a recurrent
- `create_zero_auth` — zero-dollar auth for card validation

### v0.3 (planned)
- Marketplace: sub-merchant onboarding endpoints
- Bank slip (boleto) registered-only helpers
- Webhook verification helper

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Braspag Manual (Pagador)](https://braspag.github.io/manual/braspag-pagador)
- [Cielo / Braspag Developer Portal](https://developercielo.github.io)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent-driven payments on Braspag? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds a policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
