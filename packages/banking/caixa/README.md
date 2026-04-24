# @codespar/mcp-caixa

MCP server for [Caixa Econômica Federal](https://developers.caixa) — Brazil's largest state-owned bank.

Caixa occupies a segment none of the private tier-1 banks (Itaú, Bradesco, Santander, BB) can cover: it runs federal social programs (PIS/PASEP, FGTS, Bolsa Família / Auxílio Brasil), operates the national lottery (Loterias Caixa), and is the preferred bank for merchants that value state-bank credibility or serve beneficiaries of federal transfer programs. For the payment surface that matters to merchants — Pix, boleto (Cobrança / SICOB), and extrato — Caixa follows the BACEN Pix v2 standard shared across every tier-1 bank, so the integration shape mirrors its private-sector peers.

## Status: alpha (`0.1.0-alpha.1`)

Caixa's Developer Portal is **contract-gated**, and as a state-owned institution the onboarding is additionally bureaucratic: vendor registration and credenciamento are required on top of the commercial merchant contract. Full OpenAPI specs for Pix, Cobrança (SICOB), and Extrato are only visible to onboarded merchants. The endpoint paths in this server are best-guesses based on (a) BACEN Pix v2 standard paths, (b) Caixa's public SICOB / Cobrança integration guides, and (c) conventions shared with Itaú / Bradesco / BB. Every unverified path is flagged `TODO(verify)` in the source.

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
| `create_boleto` | Issue a boleto via Caixa Cobrança (SICOB) |
| `get_boleto` | Retrieve a boleto |
| `cancel_boleto` | Cancel (baixa) an outstanding boleto |
| `get_statement` | Account statement transactions |

Arrecadação (utility/tax bill payment) is intentionally omitted in this alpha — Caixa's arrecadação surface is largely oriented around government convênios rather than merchant-initiated payments. Open an issue if you need it.

## Why Caixa (vs. a private bank)

- **Social-program beneficiaries.** If a meaningful slice of your customer base receives federal transfers, Caixa is where the money lands first.
- **State-bank credibility.** Government-adjacent merchants, concessionárias, and regulated verticals often prefer — or are required — to hold accounts at a state-owned bank.
- **Lottery / Loterias Caixa corridor.** Retailers in the lotérica network settle through Caixa.
- **Same Pix / boleto rails as the private banks.** No technical tradeoff — the BACEN Pix v2 standard is identical.

## Install

```bash
npm install @codespar/mcp-caixa@0.1.0-alpha.1
```

## Environment

```bash
CAIXA_CLIENT_ID="..."       # OAuth client_id from Caixa's Developer Portal
CAIXA_CLIENT_SECRET="..."   # OAuth client_secret
CAIXA_CERT_PATH="/abs/path/to/client.crt"   # mTLS client certificate
CAIXA_KEY_PATH="/abs/path/to/client.key"    # mTLS private key
CAIXA_ENV="sandbox"                          # or "production" (default: sandbox)
```

## Authentication

Two factors are **both** required on every call:

1. **OAuth2 `client_credentials`** — the server calls the token endpoint, caches the bearer until ~60s before expiry, and attaches `Authorization: Bearer <token>` to downstream calls.
2. **mTLS** — BACEN mandates mutual TLS for Pix v2, and Caixa enforces it across product families. The server loads the client certificate and private key from the paths you set, builds a Node `https.Agent`, and routes every request through it.

You obtain the cert + key bundle from the Caixa Developer Portal after your merchant contract and credenciamento are approved. They are distinct from the OAuth credentials.

## Run

```bash
# stdio (default)
npx @codespar/mcp-caixa

# HTTP transport
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-caixa
```

## Caveats

- **Paths are unverified.** See the `TODO(verify)` markers in `src/index.ts`. Onboarded merchants should validate against their portal-issued OpenAPI spec and open a PR.
- **Sandbox host is a guess.** Caixa issues a homologação subdomain per merchant; override by editing `BASE_URL` if your provisioned sandbox URL differs.
- **SICOB legacy.** Older boleto contracts may still route through the legacy SIGCB surface. The `create_boleto` / `get_boleto` / `cancel_boleto` tools target Cobrança v2; if your contract predates it, paths will differ.
- **Onboarding timeline.** Factor weeks, not days. State-owned vendor registration is the critical path — start it before you start coding.

## License

MIT
