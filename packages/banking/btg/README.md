# @codespar/mcp-btg

MCP server for [BTG Pactual](https://developer.btgpactual.com) — Brazil's (and LatAm's) largest investment bank.

BTG runs a digital banking + investments stack (BTG+) on top of an institutional brokerage backbone. Merchants and fintechs integrate to BTG for the combination of Pix/boleto rails *and* an investment-account API surface (CDB, LCI, LCA, debêntures, funds) that no retail bank exposes at this depth.

## Status: alpha (`0.1.0-alpha.1`)

BTG's Developer Portal is **contract-gated** — the full OpenAPI specs are only visible to onboarded counterparties. The endpoint paths in this server are best-guesses based on (a) BACEN Pix v2 standard paths, (b) BTG's public marketing pages, and (c) conventions shared with other Brazilian banks. Every unverified path is flagged `TODO(verify)` in the source.

Pin to exact versions during `0.1.x`; paths will be corrected to match the portal spec once an onboarded counterparty can validate.

## Tools (12)

| Tool | Purpose |
|---|---|
| `get_oauth_token` | Mint or return a cached OAuth2 client_credentials bearer token for the BTG Developer Portal. |
| `create_pix_cob` | Create an immediate Pix charge (cob) with QR code. |
| `get_pix_cob` | Retrieve an immediate Pix charge (cob) by its txid. |
| `create_boleto` | Issue a boleto via BTG Cobrança. |
| `get_boleto` | Retrieve a boleto by its BTG identifier (id or nosso_numero). |
| `get_account_balance` | Retrieve the available balance for a BTG+ checking account (conta corrente). |
| `get_account_statement` | Retrieve account statement transactions for a given period. |
| `list_investment_positions` | List the counterparty's investment positions held at BTG, scoped to fixed-income asset classes (CDB, LCI, L... |
| `get_portfolio_summary` | Consolidated portfolio summary across all asset classes held at BTG (fixed income, funds, equities, treasur... |
| `list_funds_available` | List funds available for distribution on BTG's platform. |
| `subscribe_to_fund` | Subscribe (aplicar) to a fund on BTG's distribution platform. |
| `redeem_from_fund` | Redeem (resgatar) from a fund. |

## Install

```bash
npm install @codespar/mcp-btg@0.1.0-alpha.1
```

## Environment

```bash
BTG_CLIENT_ID="..."       # OAuth client_id from BTG's Developer Portal
BTG_CLIENT_SECRET="..."   # OAuth client_secret
BTG_CERT_PATH="/abs/path/to/client.crt"   # mTLS client certificate
BTG_KEY_PATH="/abs/path/to/client.key"    # mTLS private key
BTG_ENV="sandbox"                          # or "production" (default: sandbox)
```

## Authentication

Two factors are **both** required on every call:

1. **OAuth2 `client_credentials`** — the server calls the token endpoint, caches the bearer until ~60s before expiry, and attaches `Authorization: Bearer <token>` to downstream calls.
2. **mTLS** — BACEN mandates mutual TLS for Pix v2, and BTG enforces it across product families (banking + investments). The server loads the client certificate and private key from the paths you set, builds a Node `https.Agent`, and routes every request through it.

You obtain the cert + key bundle from the BTG Developer Portal after contract onboarding. They are distinct from the OAuth credentials.

## Run

```bash
# stdio (default)
npx @codespar/mcp-btg

# HTTP transport
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-btg
```

## Caveats

- **Paths are unverified.** See the `TODO(verify)` markers in `src/index.ts`. Onboarded counterparties should validate against their portal-issued OpenAPI spec and open a PR.
- **Sandbox host is a guess.** BTG issues a sandbox subdomain per counterparty; override by editing `BASE_URL` if your provisioned sandbox URL differs.
- **Investments surface (CDB/LCI/LCA/debêntures/funds)** is differentiated vs. retail-bank MCPs in this repo, but the field shapes will move once the OpenAPI spec is byte-verified.

## License

MIT
