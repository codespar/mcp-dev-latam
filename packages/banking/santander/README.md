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

## Tools (23)

| Tool | Purpose |
|---|---|
| `get_oauth_token` | Mint or return a cached OAuth2 client_credentials bearer token for the Santander Developer Portal. |
| `send_pix` | Initiate an outbound Pix payment from the merchant's Santander account. |
| `create_pix_qr` | Create a dynamic Pix charge with QR code (cob). |
| `get_pix` | Retrieve a Pix transaction by its BCB endToEndId (E<ispb><yyyymmddhhmm><sequence>). |
| `resolve_dict_key` | Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. |
| `refund_pix` | Refund (devolução) a previously received Pix. |
| `create_boleto` | Issue a boleto via Santander Cobrança (collection_bill_management v2). |
| `get_boleto` | Retrieve a boleto by its Santander bill_id (SONDA query via collection_bill_management v2). |
| `cancel_boleto` | Cancel (baixa) an outstanding boleto before payment. |
| `get_statement` | Retrieve account statement transactions for a given period. |
| `create_pix_cobv` | Create a Pix charge with due date (cobv — cobrança com vencimento). |
| `get_pix_cob` | Retrieve a Pix immediate charge (cob) by its txid. |
| `list_pix_cob` | List Pix immediate charges (cob) created in a given period. |
| `update_pix_cob` | Update (PATCH) an existing Pix immediate charge. |
| `list_pix_received` | List received Pix (Pix recebidos) in a given period. |
| `register_dict_key` | Register a new DICT key for one of the merchant's Santander accounts. |
| `delete_dict_key` | Remove (unregister) a DICT key previously registered for the merchant. |
| `download_boleto_pdf` | Fetch the PDF (second copy / segunda via) of a registered boleto. |
| `get_account_balance` | Get current available and blocked balance for a Santander merchant account. |
| `send_ted` | Initiate a TED transfer from a Santander merchant account to an account at another bank. |
| `transfer_internal` | Transfer between two Santander accounts (TEF / mesma instituição). |
| `create_openfinance_consent` | Create an Open Finance consent (BACEN-regulated) for data access or payment initiation against a third-part... |
| `arrecadacao_pay` | Pay a utility, tax, or concessionária bill via Santander Arrecadação / Pagamento de Contas. |

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
