# @codespar/mcp-certta

> **Deprecated: no live endpoint.** Measured on 2026-09-27 against two public DNS resolvers (8.8.8.8 and 1.1.1.1): `api.certta.com.br`, the host this server calls, does not resolve in DNS. `docs.certta.ai` redirects to CAF's documentation (Certta is CAF's current brand), which names `api.combateafraude.com/v1` (Core API, not recommended for new integrations) and `api.us.prd.caf.io` (Connect API); this server was not written against either and has not been checked. See also `@codespar/mcp-caf`. No tool in this server reaches a service. The package is deprecated on npm and stays in this repository for reference only. If you have a working endpoint, point the server at it with `CERTTA_BASE_URL`. To bring the package back, open an issue in [mcp-dev-latam](https://github.com/codespar/mcp-dev-latam/issues) with the provider's documented base URL.

MCP server for **Certta** — Brazilian identity + signature platform. KYC/KYB (CPF / CNPJ via Receita Federal + SPC / Serasa), face match + liveness, OCR of RG / CNH / comprovantes, antifraud score, ICP-Brasil digital signature + GoCertta electronic signature, and orchestrated onboarding pipelines that chain KYC + biometrics + signature in one process.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "certta": {
      "command": "npx",
      "args": ["@codespar/mcp-certta"],
      "env": {
        "CERTTA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor / VS Code

Same config in `.cursor/mcp.json`.

## Tools (11)

### KYC / KYB

| Tool | Certta endpoint | Notes |
|---|---|---|
| `kyc_lookup_cpf` | `POST /v1/kyc/cpf` | CPF → name, DOB, regularity, restrictions, risk score |
| `kyb_lookup_cnpj` | `POST /v1/kyb/cnpj` | CNPJ → corporate profile, QSA, CNAE, capital |

### Biometrics

| Tool | Certta endpoint | Notes |
|---|---|---|
| `biometrics_face_match` | `POST /v1/biometrics/face-match` | Selfie vs document photo + liveness |
| `biometrics_liveness` | `POST /v1/biometrics/liveness` | Passive liveness on a selfie |

### Documents + antifraud

| Tool | Certta endpoint | Notes |
|---|---|---|
| `documents_ocr` | `POST /v1/documents/ocr` | OCR RG / CNH / CRLV / proof of residence / passport |
| `antifraud_score` | `POST /v1/antifraud/score` | Composite risk score (0..100) |

### Signature

| Tool | Certta endpoint | Notes |
|---|---|---|
| `signature_icp_create` | `POST /v1/signature/icp/envelopes` | ICP-Brasil digital signature envelope |
| `signature_electronic_create` | `POST /v1/signature/electronic/envelopes` | GoCertta electronic signature envelope |
| `signature_get_envelope` | `GET /v1/signature/envelopes/{envelope_id}` | Status + signer responses |

### Onboarding pipelines

| Tool | Certta endpoint | Notes |
|---|---|---|
| `onboarding_process_create` | `POST /v1/onboarding/processes` | Orchestrate KYC + biometrics + signature in one flow |
| `onboarding_process_get` | `GET /v1/onboarding/processes/{process_id}` | Per-step verdicts |

## Authentication

Standard Bearer auth:

```
Authorization: Bearer <CERTTA_API_KEY>
```

Issue your API key from the Certta dashboard:

- Production: <https://certta.com.br>
- Docs: <https://docs.certta.com.br>

## Sandbox / Testing

Sandbox endpoint: `https://api-sandbox.certta.com.br`. Override via `CERTTA_API_BASE`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CERTTA_API_KEY` | yes | API key from the Certta dashboard |
| `CERTTA_API_BASE` | no | Override base URL (default `https://api.certta.com.br`) |

## Certta vs Caf vs BigDataCorp

Three BR identity rails in this catalog, each with a different specialty:

| Provider | Strength | Best for |
|---|---|---|
| **[Certta](https://certta.com.br)** | KYC + biometrics + ICP-Brasil signature | Onboarding with signed contracts |
| **[Caf](https://caf.io)** (`@codespar/mcp-caf`) | KYC + Trust Platform orchestration | Hosted onboarding with policy rules |
| **[BigDataCorp](https://bigdatacorp.com.br)** (`@codespar/mcp-bigdatacorp`) | Broad data enrichment + antifraud | KYC + AML + credit decisioning |

## Enterprise

Need governance, budget limits, and audit trails for agent identity calls? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
