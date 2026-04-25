# @codespar/mcp-bradesco

MCP server for [Bradesco](https://developers.bradesco.com.br) — Brazil's 2nd largest private bank (after Itaú).

Together with [`@codespar/mcp-itau`](../itau), [`@codespar/mcp-banco-inter`](../../payments/banco-inter), and [`@codespar/mcp-stark-bank`](../stark-bank), this covers the major BR private-bank API landscape. Merchants with meaningful Pix, boleto, and cash-management volume integrate directly with Bradesco instead of going through a PSP.

## Status: alpha (`0.1.0-alpha.1`)

Bradesco's Developer Portal is **contract-gated** — the full OpenAPI specs for Pix, Cobrança, Arrecadação, and Extrato are only visible to onboarded merchants. The endpoint paths in this server are best-guesses based on (a) BACEN Pix v2 standard paths, (b) Bradesco's public integration guides, and (c) conventions shared across Itaú / Santander / BB. Every unverified path is flagged `TODO(verify)` in the source.

Pin to exact versions during `0.1.x`; paths will be corrected to match the portal spec once an onboarded merchant can validate.

## Tools (22)

| Tool | Purpose |
|---|---|
| `get_oauth_token` | Mint or return a cached OAuth2 client_credentials bearer token for the Bradesco Developer Portal. |
| `send_pix` | Initiate an outbound Pix payment from the merchant's Bradesco account. |
| `create_pix_qr` | Create a dynamic Pix charge with QR code (cob). |
| `get_pix` | Retrieve a Pix transaction by its BCB endToEndId (E<ispb><yyyymmddhhmm><sequence>). |
| `resolve_dict_key` | Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. |
| `refund_pix` | Refund (devolução) a previously received Pix. |
| `create_boleto` | Issue a boleto via Bradesco Cobrança. |
| `get_boleto` | Retrieve a boleto by its Bradesco identifier (id or nosso_numero). |
| `cancel_boleto` | Cancel (baixa) an outstanding boleto before payment. |
| `get_statement` | Retrieve account statement transactions for a given period. |
| `arrecadacao_pay` | Pay a utility, tax, or concessionária bill via Bradesco Arrecadação. |
| `list_pix_received` | List Pix transactions received by the merchant during a period. |
| `create_pix_due_charge` | Create a Pix charge with a due date (cobv) — commonly used for installments and scheduled invoices. |
| `get_pix_due_charge` | Retrieve a Pix due charge (cobv) by txid. |
| `update_pix_due_charge` | Patch a Pix due charge (cobv) — revise amount, due date, discount, or debtor before payment. |
| `register_dict_key` | Register a DICT key (CPF, CNPJ, email, phone, or EVP) pointing to a merchant account at Bradesco. |
| `delete_dict_key` | Delete (unlink) a DICT key that points to a merchant account at Bradesco. |
| `list_boletos` | List boletos issued by the merchant filtered by status and issue/due period. |
| `get_boleto_pdf` | Download the boleto PDF as base64. |
| `get_account_balance` | Retrieve the current available balance (saldo disponível) for a merchant account. |
| `transfer_ted` | Execute a TED (or TEF when intra-Bradesco) transfer from the merchant's account to a beneficiary bank account. |
| `pay_tax_darf` | Pay a federal tax (DARF) or union fee (GRU) via Bradesco Arrecadação. |

## Install

```bash
npm install @codespar/mcp-bradesco@0.1.0-alpha.1
```

## Environment

```bash
BRADESCO_CLIENT_ID="..."       # OAuth client_id from Bradesco's Developer Portal
BRADESCO_CLIENT_SECRET="..."   # OAuth client_secret
BRADESCO_CERT_PATH="/abs/path/to/client.crt"   # mTLS client certificate
BRADESCO_KEY_PATH="/abs/path/to/client.key"    # mTLS private key
BRADESCO_ENV="sandbox"                          # or "production" (default: sandbox)
```

## Authentication

Two factors are **both** required on every call:

1. **OAuth2 `client_credentials`** — the server calls the token endpoint, caches the bearer until ~60s before expiry, and attaches `Authorization: Bearer <token>` to downstream calls.
2. **mTLS** — BACEN mandates mutual TLS for Pix v2, and Bradesco enforces it across product families. The server loads the client certificate and private key from the paths you set, builds a Node `https.Agent`, and routes every request through it.

You obtain the cert + key bundle from the Bradesco Developer Portal after your merchant contract is signed. They are distinct from the OAuth credentials.

## Base URLs

- **Production**: `https://proxy.api.prebanco.com.br` (Bradesco's standard external proxy)
- **Sandbox**: `https://apihom-bradescorip.bradesco.com.br` (homologação)

Both hosts are marked `TODO(verify)` — Bradesco provisions per-merchant subdomains in some product families and the exact homologação host may differ. Fork and override `BASE_URL` if your portal provisioning differs.

## Run

```bash
# stdio (default)
npx @codespar/mcp-bradesco

# HTTP transport
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-bradesco
```

## Caveats

- **Paths are unverified.** See the `TODO(verify)` markers in `src/index.ts`. Onboarded merchants should validate against their portal-issued OpenAPI spec and open a PR.
- **Base URLs are best-guess.** See above — override if your provisioning differs.
- **Arrecadação barcode validation** is server-side in this alpha — no client-side mod-10 / mod-11 check yet.

## License

MIT
