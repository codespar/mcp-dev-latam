# @codespar/mcp-itau

MCP server for [Itaú Unibanco](https://devportal.itau.com.br) — Brazil's largest private bank.

Itaú operates the largest private-bank API surface in the country. Merchants running high-volume Pix, boleto, and cash-management workloads integrate directly instead of going through a PSP.

## Status: alpha (`0.1.0-alpha.1`)

Itaú's Developer Portal is **contract-gated** — the full OpenAPI specs for Pix, Cobrança, Arrecadação, and Extrato are only visible to onboarded merchants. The endpoint paths in this server are best-guesses based on (a) BACEN Pix v2 standard paths, (b) Itaú's public marketing pages, and (c) conventions shared across Santander / Bradesco / BB. Every unverified path is flagged `TODO(verify)` in the source.

Pin to exact versions during `0.1.x`; paths will be corrected to match the portal spec once an onboarded merchant can validate.

## Tools (22)

| Tool | Purpose |
|---|---|
| `get_oauth_token` | Mint or return a cached OAuth2 client_credentials bearer token for the Itaú Developer Portal. |
| `send_pix` | Initiate an outbound Pix payment from the merchant's Itaú account. |
| `create_pix_qr` | Create a dynamic Pix charge with QR code (cob). |
| `get_pix` | Retrieve a Pix transaction by its BCB endToEndId (E<ispb><yyyymmddhhmm><sequence>). |
| `resolve_dict_key` | Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. |
| `refund_pix` | Refund (devolução) a previously received Pix. |
| `create_boleto` | Issue a boleto via Itaú Cobrança. |
| `get_boleto` | Retrieve a boleto by its Itaú identifier (id or nosso_numero). |
| `cancel_boleto` | Cancel (baixa) an outstanding boleto before payment. |
| `get_statement` | Retrieve account statement transactions for a given period. |
| `arrecadacao_pay` | Pay a utility, tax, or concessionária bill via Itaú Arrecadação. |
| `create_pix_cobv` | Create a Pix charge with due date (cobv) — used for boleto-like Pix where the payer can pay at or after a d... |
| `list_pix_charges` | List immediate Pix charges (cob) registered by the merchant within a date range. |
| `register_pix_key` | Register a DICT key (CPF, CNPJ, email, phone, or EVP) on an Itaú account owned by the merchant. |
| `delete_pix_key` | Delete a DICT key owned by the merchant. |
| `list_pix_keys` | List DICT keys currently registered to the merchant's Itaú accounts. |
| `get_boleto_pdf` | Download the PDF of an issued boleto. |
| `send_ted` | Send a TED transfer to an account at another bank. |
| `transfer_between_accounts` | TAA — transfer between two Itaú accounts (owned by the merchant or a counterparty). |
| `get_tariffs` | Query the tariff schedule applicable to the merchant's active contracts (Pix per-transaction, boleto regist... |
| `list_dda_bills` | List bills registered for the merchant under the DDA (Débito Direto Autorizado) enrolment. |
| `schedule_payment` | Schedule a future-dated payment (Pix, boleto, arrecadação, or TED). |

## Install

```bash
npm install @codespar/mcp-itau@0.1.0-alpha.1
```

## Environment

```bash
ITAU_CLIENT_ID="..."       # OAuth client_id from Itaú's Developer Portal
ITAU_CLIENT_SECRET="..."   # OAuth client_secret
ITAU_CERT_PATH="/abs/path/to/client.crt"   # mTLS client certificate
ITAU_KEY_PATH="/abs/path/to/client.key"    # mTLS private key
ITAU_ENV="sandbox"                          # or "production" (default: sandbox)
```

## Authentication

Two factors are **both** required on every call:

1. **OAuth2 `client_credentials`** — the server calls the token endpoint, caches the bearer until ~60s before expiry, and attaches `Authorization: Bearer <token>` to downstream calls.
2. **mTLS** — BACEN mandates mutual TLS for Pix v2, and Itaú enforces it across product families. The server loads the client certificate and private key from the paths you set, builds a Node `https.Agent`, and routes every request through it.

You obtain the cert + key bundle from the Itaú Developer Portal after your merchant contract is signed. They are distinct from the OAuth credentials.

## Run

```bash
# stdio (default)
npx @codespar/mcp-itau

# HTTP transport
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-itau
```

## Caveats

- **Paths are unverified.** See the `TODO(verify)` markers in `src/index.ts`. Onboarded merchants should validate against their portal-issued OpenAPI spec and open a PR.
- **Sandbox host is a guess.** Itaú issues a sandbox subdomain per merchant; override by editing `BASE_URL` if your provisioned sandbox URL differs.
- **Arrecadação barcode validation** is server-side in this alpha — no client-side mod-10 / mod-11 check yet.

## License

MIT
