# @codespar/mcp-caf

> **Deprecated: no live endpoint.** Measured on 2026-09-27 against two public DNS resolvers (8.8.8.8 and 1.1.1.1): `api.caf.io`, the host this server calls, does not resolve in DNS. CAF's docs (now branded Certta) name `api.combateafraude.com/v1` for the Core API, which they no longer recommend for new integrations, and `api.us.prd.caf.io` for the newer Connect API; this server was not written against either and has not been checked. No tool in this server reaches a service. The package is deprecated on npm and stays in this repository for reference only. If you have a working endpoint, point the server at it with `CAF_BASE_URL`. To bring the package back, open an issue in [mcp-dev-latam](https://github.com/codespar/mcp-dev-latam/issues) with the provider's documented base URL.

MCP server for **Caf** — Brazilian identity + Trust Platform. KYC/KYB, face authentication + liveness, document validation + OCR, and orchestrated onboarding flows. Direct competitor to Unico / IDwall / Certta; their Trust Platform chains multi-step identity verifications with policy rules.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "caf": {
      "command": "npx",
      "args": ["@codespar/mcp-caf"],
      "env": {
        "CAF_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor / VS Code

Same config in `.cursor/mcp.json`.

## Tools (9)

### KYC / KYB

| Tool | Caf endpoint | Notes |
|---|---|---|
| `person_check` | `POST /v1/checks/person` | CPF → name, DOB, restrictions, risk |
| `company_check` | `POST /v1/checks/company` | CNPJ → profile, QSA, sanctions |

### Biometrics

| Tool | Caf endpoint | Notes |
|---|---|---|
| `face_authentication` | `POST /v1/biometrics/face` | Selfie vs base image + liveness |
| `liveness_check` | `POST /v1/biometrics/liveness` | Passive liveness only |

### Documents

| Tool | Caf endpoint | Notes |
|---|---|---|
| `document_check` | `POST /v1/checks/document` | OCR + authenticity for RG / CNH / passport / proof of residence |

### Trust Platform orchestration

| Tool | Caf endpoint | Notes |
|---|---|---|
| `trust_platform_start` | `POST /v1/trust/flows` | Hosted onboarding flow per dashboard template |
| `trust_platform_get` | `GET /v1/trust/flows/{flow_id}` | Per-step verdicts |

### Metadata + replay

| Tool | Caf endpoint | Notes |
|---|---|---|
| `list_datasources` | `GET /v1/datasources` | Datasources enabled on your account |
| `get_check_result` | `GET /v1/checks/{check_id}` | Replay a previous check by id |

## Authentication

Standard Bearer auth:

```
Authorization: Bearer <CAF_API_KEY>
```

Issue your API key from the Caf dashboard:

- Production: <https://caf.io>
- Docs: <https://docs.caf.io>

## Sandbox / Testing

Sandbox endpoint: `https://api-sandbox.caf.io`. Override via `CAF_API_BASE`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CAF_API_KEY` | yes | API key from the Caf dashboard |
| `CAF_API_BASE` | no | Override base URL (default `https://api.caf.io`) |

## Caf vs Certta vs BigDataCorp

Three BR identity rails in this catalog, each with a different specialty:

| Provider | Strength | Best for |
|---|---|---|
| **[Caf](https://caf.io)** | KYC + Trust Platform orchestration | Hosted onboarding with policy rules |
| **[Certta](https://certta.com.br)** (`@codespar/mcp-certta`) | KYC + biometrics + ICP-Brasil signature | Onboarding with signed contracts |
| **[BigDataCorp](https://bigdatacorp.com.br)** (`@codespar/mcp-bigdatacorp`) | Broad data enrichment + antifraud | KYC + AML + credit decisioning |

## Enterprise

Need governance, budget limits, and audit trails for agent identity calls? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
