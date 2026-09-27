# @codespar/mcp-unico

> **Deprecated: no live endpoint.** Measured on 2026-09-27 against two public DNS resolvers (8.8.8.8 and 1.1.1.1): `api.unico.co` (API) and `auth.unico.co` (token) do not resolve in DNS. Unico's developer docs now name `api.id.unico.app` / `api.id.uat.unico.app` for the API and `identity.acesso.io` / `identityhomolog.acesso.io` for OAuth; this server's paths and auth were not written against them and have not been checked. No tool in this server reaches a service. The package is deprecated on npm and stays in this repository for reference only. If you have a working endpoint, point the server at it with `UNICO_BASE_URL` and `UNICO_AUTH_URL`. To bring the package back, open an issue in [mcp-dev-latam](https://github.com/codespar/mcp-dev-latam/issues) with the provider's documented base URL.

MCP server for [Unico](https://unico.io) — the Brazilian identity verification leader. CPF/CNPJ validation, document OCR, face biometrics, liveness, PEP / watchlist / court-records screening.

First entry in the CodeSpar `identity` category. Commerce agents onboarding sellers (marketplaces), running high-value transactions, or operating KYC-regulated flows need identity verification — Unico is the BR standard. Paired with [`@codespar/mcp-onfido`](../onfido) for BR-first + global coverage.

## Products

Unico sells three separately-contracted products. This server exposes tools for all three; agents should call only what's enabled on your contract (disabled products return 403).

| Product  | What it does                                                            |
|----------|-------------------------------------------------------------------------|
| IDCloud  | CPF/CNPJ validation with Receita Federal, document OCR, authenticity    |
| IDPay    | Face match + liveness for login and payment authentication              |
| IDCheck  | PEP, sanctions watchlists, Brazilian court records                      |

## Tools (18)

| Tool | Purpose |
|---|---|
| `validate_cpf` | IDCloud: validate a Brazilian CPF with Receita Federal. |
| `validate_cnpj` | IDCloud: validate a Brazilian CNPJ with Receita Federal. |
| `extract_document` | IDCloud: OCR + structured field extraction from a Brazilian ID document image. |
| `verify_document_authenticity` | IDCloud: tamper / forgery detection on a document image. |
| `face_match` | IDPay: biometric 1:1 comparison between a live selfie and a document photo. |
| `liveness_check` | IDPay: passive liveness detection. |
| `check_pep` | IDCheck: Politically Exposed Person screening. |
| `check_watchlists` | IDCheck: global sanctions / adverse-media screening. |
| `court_records_search` | IDCheck: Brazilian judicial-records search. |
| `get_process_status` | IDCheck: poll the status of a verification process previously created via the Unico Web/Mobile SDK or API. |
| `batch_get_process_status` | IDCheck: batch status lookup. |
| `upload_process_document` | IDCheck: upload a captured image to a running verification process. |
| `get_extracted_data` | IDCheck: fetch the structured OCR result for a finished process — typed fields (name, document number, issu... |
| `get_unico_score` | IDCheck: Unico Score — Brazil's identity-fraud risk score (0-1000, higher = lower risk) computed from Unico... |
| `connect_portability_check` | Connect: cross-tenant portability check. |
| `register_webhook` | Webhooks: subscribe a callback URL to receive Unico process events (process.created, process.finished, proc... |
| `list_webhooks` | Webhooks: list all webhook subscriptions registered for this tenant. |
| `delete_webhook` | Webhooks: remove a webhook subscription. |

## Install

```bash
npm install @codespar/mcp-unico@alpha
```

## Environment

```bash
UNICO_CLIENT_ID="..."       # OAuth client_id
UNICO_CLIENT_SECRET="..."   # OAuth client_secret
UNICO_ENV="sandbox"         # Optional. 'sandbox' | 'production'. Default: sandbox
UNICO_BASE_URL="..."        # Optional. Default: https://api.unico.co
UNICO_AUTH_URL="..."        # Optional. Default: https://auth.unico.co
```

## Authentication

OAuth 2.0 Client Credentials. The server posts `client_id:client_secret` as Basic auth to Unico's token endpoint and caches the bearer token in memory until 60 s before expiry. Unico's docs require server-side integration only — never expose these credentials to a browser or mobile client.

## Run

```bash
# stdio (default)
npx @codespar/mcp-unico

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-unico
```

## Status

Shipped as `0.1.0-alpha.1`. Unico's REST contract lives behind the [devcenter.unico.io](https://devcenter.unico.io) portal and is gated by merchant account. Tool names and argument shapes are stable, but exact endpoint paths may shift once we validate against live credentials — override `UNICO_BASE_URL` / `UNICO_AUTH_URL` if your account is served from a different host. PRs welcome once you've seen the real payloads.

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
