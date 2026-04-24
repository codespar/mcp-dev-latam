# @codespar/mcp-santander

MCP server for [Santander Brasil](https://developer.santander.com.br) — 3rd largest private bank in Brazil.

Completes the top-3 BR private-bank trio: **Itaú + Bradesco + Santander**. Same OAuth2 + mTLS shape as its peers; different merchant contract.

Merchants with meaningful Pix, boleto, and cash-management volume integrate directly with Santander instead of going through a PSP.

## Status: alpha (`0.1.0-alpha.1`)

Santander's Developer Portal is **contract-gated** — the full OpenAPI specs for Pix, Cobrança, Arrecadação, and Extrato are only visible to onboarded merchants. The following pieces are **verified** against Santander's public integration guides:

- Production host: `https://trust-open.api.santander.com.br`
- Sandbox host: `https://trust-sandbox.api.santander.com.br`
- OAuth2 token: `/auth/oauth/v2/token`
- Cobrança v2 base: `/collection_bill_management/v2/workspaces/{workspace_id}/bank_slips`

Remaining paths (Pix, Arrecadação, Extrato) are best-guesses based on (a) BACEN Pix v2 standard paths, (b) Santander public marketing, and (c) conventions shared across Itaú / Bradesco / BB. Every unverified path is flagged `TODO(verify)` in the source.

Pin to exact versions during `0.1.x`; paths will be corrected to match the portal spec once an onboarded merchant can validate.

## Tools

| Tool | Purpose |
|---|---|
| `get_oauth_token` | Mint / inspect a cached OAuth2 bearer |
| `send_pix` | Initiate an outbound Pix payment |
| `create_pix_qr` | Create a dynamic Pix charge with QR (cob) |
| `get_pix` | Retrieve a Pix by `endToEndId` |
| `resolve_dict_key` | Resolve a DICT key (CPF/CNPJ/email/phone/EVP) to an account |
| `refund_pix` | Refund (devolução) a received Pix |
| `create_boleto` | Issue a boleto via Santander Cobrança v2 (workspace-scoped) |
| `get_boleto` | Retrieve a boleto (SONDA query) |
| `cancel_boleto` | Cancel (baixa) an outstanding boleto |
| `get_statement` | Account statement transactions |
| `arrecadacao_pay` | Pay utility / tax / concessionária bills |

## Install

```bash
npm install @codespar/mcp-santander@0.1.0-alpha.1
```

## Environment

```bash
SANTANDER_CLIENT_ID="..."       # OAuth client_id from Santander's Developer Portal
SANTANDER_CLIENT_SECRET="..."   # OAuth client_secret
SANTANDER_CERT_PATH="/abs/path/to/client.crt"   # mTLS client certificate
SANTANDER_KEY_PATH="/abs/path/to/client.key"    # mTLS private key
SANTANDER_ENV="sandbox"                         # or "production" (default: sandbox)
```

## Authentication

Two factors are **both** required on every call:

1. **OAuth2 `client_credentials`** — the server POSTs to `/auth/oauth/v2/token` on the `trust-open` (or `trust-sandbox`) gateway, caches the bearer until ~60s before expiry, and attaches `Authorization: Bearer <token>` to downstream calls.
2. **mTLS** — BACEN mandates mutual TLS for Pix v2, and Santander's `trust-open` gateway enforces it across product families. The server loads the client certificate and private key from the paths you set, builds a Node `https.Agent`, and routes every request through it.

You obtain the cert + key bundle from the Santander Developer Portal after your merchant contract is signed. They are distinct from the OAuth credentials.

## Cobrança: workspace model

Santander's Cobrança v2 is **workspace-scoped**. Before registering boletos you provision one or more `workspace_id`s via the Developer Portal — each binds a convênio, boleto/Pix billing mode, and webhook URL. The `create_boleto`, `get_boleto`, and `cancel_boleto` tools all take a `workspace_id` argument.

## Run

```bash
# stdio (default)
npx @codespar/mcp-santander

# HTTP transport
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-santander
```

## Caveats

- **Pix / Arrecadação / Extrato paths are unverified.** See the `TODO(verify)` markers in `src/index.ts`. Onboarded merchants should validate against their portal-issued OpenAPI spec and open a PR.
- **Cobrança cancel** is modelled as a `PATCH` with `status: "BAIXADO"`; the covenant-specific cancellation semantics may differ.
- **Arrecadação barcode validation** is server-side in this alpha — no client-side mod-10 / mod-11 check yet.

## License

MIT
