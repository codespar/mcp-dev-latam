# Architecture

## How MCP Servers Work

- Each server is a standalone Node.js process
- Communicates via stdio (stdin/stdout) using JSON-RPC 2.0
- No state between calls — each tool call is independent
- Server discovers tools via `ListTools`, executes via `CallTool`
- Uses `@modelcontextprotocol/sdk` for the server framework

## Project Structure

```
packages/
  {vertical}/              # payments, fiscal, communication, etc.
    {service}/
      src/
        index.ts           # Server implementation (tools + handlers)
        __tests__/         # Vitest test files
      package.json         # npm package config
      tsconfig.json        # TypeScript config
      README.md            # Server docs
registry/
  {service}.server.json    # MCP Registry metadata per server
docs/
  CONTRIBUTING.md          # How to add a new server
  SECURITY.md              # Security guidelines
  RATE-LIMITS.md           # Rate limiting info
  COST-ESTIMATOR.md        # Paid vs free tool reference
  COMPLETE-ORDER-WORKFLOW.md
vitest.config.ts           # Shared test config
package.json               # Workspace root (npm workspaces)
```

### Verticals

| Vertical | Servers |
|----------|---------|
| payments | zoop, asaas, pagar-me, iugu, ebanx, efi, vindi, stone, celcoin, cielo, pagseguro, pix-bcb |
| fiscal | nuvem-fiscal, focus-nfe, conta-azul |
| communication | z-api, evolution-api, zenvia, take-blip, rd-station |
| erp | omie, bling, tiny |
| banking | open-finance, stark-bank |
| identity | brasil-api |
| ecommerce | correios, melhor-envio, vtex |
| crypto | mercado-bitcoin, bitso, circle, unblockpay |

## Auth Patterns

1. **API Key (header)**: Most servers — Zoop, Asaas, Z-API, Celcoin, etc.
2. **Bearer Token**: Melhor Envio, Stark Bank, Ebanx
3. **Basic Auth**: Zoop (base64-encoded `API_KEY:`)
4. **No Auth**: BrasilAPI, Pix BCB (public APIs)
5. **OAuth**: Not yet implemented (planned for v0.3)

## Tool Design Principles

- **One tool per API operation** — not generic CRUD wrappers
- **Naming convention**: `verb_noun` (e.g., `create_payment`, `get_cep`, `list_transactions`)
- **Required params only** in tool definition — optional params in JSON Schema
- **Error format**: `{ content: [{ type: "text", text }], isError: true }`
- **Descriptions**: clear enough for an LLM to pick the right tool

## API Request Pattern

All servers follow the same implementation pattern:

```
1. Read env vars for auth (API key, marketplace ID, etc.)
2. Register tools via server.setRequestHandler(ListToolsRequestSchema, ...)
3. Handle calls via server.setRequestHandler(CallToolRequestSchema, ...)
4. Parse & validate input (Zod on top servers)
5. Make HTTP request to external API (fetch)
6. Return JSON result as { content: [{ type: "text", text: JSON.stringify(data) }] }
```

## Validation (v0.2+)

- Top 5 servers (zoop, asaas, brasil-api, z-api, melhor-envio) use **Zod** for input validation
- Validates: CPF/CNPJ format, email, CEP, phone, positive amounts, date format
- Validation errors are returned **before** the API call is made
- Schema helpers: `cpfSchema`, `cnpjSchema`, `emailSchema`, `cepSchema`, `positiveAmountSchema`, `dateSchema`

## Testing

- **Framework**: Vitest with mocked `fetch` (global)
- **Tests verify**: tool count, correct API calls (URL, method, headers, body), error handling, sandbox URLs
- **Run**: `npm test` from repo root
- **Config**: `vitest.config.ts` at root, workspace-aware

## Registry

- Each server has a `{service}.server.json` in `registry/`
- Format follows the [MCP Registry specification](https://modelcontextprotocol.io)
- Used for submission to the official MCP Registry
- Contains: server name, description, tools list, auth requirements, repository URL
