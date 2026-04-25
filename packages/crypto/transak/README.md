# @codespar/mcp-transak

MCP server for **Transak** — fiat↔crypto on/off-ramp across ~170 countries with multi-chain coverage (Ethereum, Solana, Polygon, BSC, Bitcoin, Arbitrum, Optimism, Base, and more).

Transak is the natural peer to MoonPay: both solve the same problem (turn local fiat into on-chain crypto, and back), but each has its own partner list, country coverage, and pricing curve. Bundling both lets an agent-commerce flow pick the best route per corridor instead of pinning to one provider.

## Why both MoonPay and Transak

- **Coverage**: MoonPay lists ~160 countries, Transak ~170. The overlaps are large but the edges are meaningful — certain LatAm, MENA, and APAC corridors are stronger on one side than the other.
- **Partners**: each has a distinct roster of DEX/wallet/dapp partners, which changes KYC reuse and custody posture for a given buyer.
- **Pricing**: fees, FX spread, and min/max vary per corridor. An agent can call `get_quote` on both, compare, and route.
- **Redundancy**: if one provider rate-limits, de-risks a country, or throws a KYC hold, the other keeps the flow alive.

This MCP server focuses on the **Partner API** (server-to-server), not the widget. Agents create orders directly, poll status, and reconcile via webhooks.

## Status

`0.1.0-alpha.1`. The public currency, payment-method, and quote endpoints were verified live against `api-stg.transak.com`. The partner-order endpoint paths (`/api/v2/orders`, `/api/v2/orders/{id}`, `/cancel`, `/api/v2/partner/me`) follow the documented conventions but a few are only fully visible inside Transak's partner dashboard — expect minor tweaks once you pair this against a real key.

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_order` | Create a Transak order. |
| `get_order` | Get a Transak order by its Transak order id. |
| `list_orders` | List Transak orders for the partner account. |
| `update_order` | Update a Transak order after creation. |
| `cancel_order` | Cancel a Transak order. |
| `get_quote` | Get a fiat↔crypto price quote (public, no auth). |
| `get_order_limits` | Get the min and max trade amount for a fiat+crypto+country combination — what's the smallest USD a US buyer... |
| `list_fiat_currencies` | List all fiat currencies Transak supports, with per-currency payment methods, limits, and country restricti... |
| `list_crypto_currencies` | List all crypto assets Transak supports, including network, decimals, pay-in/pay-out eligibility, and juris... |
| `list_payment_methods` | List payment methods available for a given fiat currency (card, Apple Pay, Google Pay, SEPA, UPI, Pix, wire... |
| `list_countries` | List the countries Transak serves, with allowed fiat currencies, payment methods, and KYC requirements per... |
| `list_network_fees` | List the network/gas fees Transak charges (or estimates) per crypto+network combination. |
| `get_partner_account` | Get the authenticated partner's account profile (name, api key info, configured webhooks, default currencies). |
| `get_partner_balance` | Get the partner's settlement balance(s) — Transak holds partner liquidity per fiat to fund SELL payouts and... |
| `refresh_access_token` | Mint a fresh short-lived access-token from the partner api-secret. |
| `get_kyc_status` | Get the KYC status of a buyer the partner has previously sent through Transak. |
| `get_user_limits` | Get the current per-user transaction limits granted by Transak based on the user's KYC tier and country (da... |
| `verify_webhook_signature` | Locally verify the HMAC-SHA256 signature on a Transak webhook delivery. |

## Environment

| Var | Required | Secret | Description |
|-----|----------|--------|-------------|
| `TRANSAK_API_KEY` | yes | no | Partner API key (also passed as `partnerApiKey` on public endpoints) |
| `TRANSAK_API_SECRET` | yes | yes | Partner API secret (sent as `api-secret` header) |
| `TRANSAK_ACCESS_TOKEN` | no | yes | Short-lived access token (sent as `access-token` header if your partner tier requires it) |
| `TRANSAK_ENV` | no | no | `staging` (default) or `production` |

## Install

```bash
npm install @codespar/mcp-transak@alpha
```

## Run (stdio)

```bash
TRANSAK_API_KEY=... TRANSAK_API_SECRET=... mcp-transak
```

## Run (HTTP)

```bash
TRANSAK_API_KEY=... TRANSAK_API_SECRET=... mcp-transak --http
# POST http://localhost:3000/mcp
```

## Docs

- Transak: <https://docs.transak.com>
- CodeSpar catalog: <https://github.com/codespar/mcp-dev-brasil>

## License

MIT
