# Contributing to MCP Brasil

Thanks for your interest in contributing! This guide helps you get started.

## Adding a New MCP Server

### 1. Create the directory structure

```bash
mkdir -p packages/<category>/<service>/src
```

Categories: `payments`, `fiscal`, `communication`, `banking`, `ecommerce`, `identity`

### 2. Create `package.json`

```json
{
  "name": "@codespar/mcp-<service>",
  "version": "0.1.0",
  "description": "MCP server for <Service Name>",
  "type": "module",
  "main": "./dist/index.js",
  "bin": { "mcp-<service>": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  },
  "license": "MIT"
}
```

### 3. Implement `src/index.ts`

Follow the pattern of existing servers (e.g., `packages/payments/asaas/src/index.ts`):

- Use `@modelcontextprotocol/sdk` for the MCP server
- Implement 8-10 tools covering the main API operations
- Use environment variables for API keys (never hardcode)
- Let an environment variable override every provider host: `<PREFIX>_BASE_URL` for the main API and `<PREFIX>_<ROLE>_URL` for any other host (token endpoint, query API), with `<PREFIX>` matching the server's credential variables. The documented default stays as the fallback: `const BASE_URL = process.env.ACME_BASE_URL || "https://api.acme.com/v1";`
- Use a default host that exists. `python3 scripts/check-catalog-hosts.py` resolves every default URL in the catalog and completes a TLS handshake with it; CI runs it on every PR that touches a server and weekly on `main`
- Support sandbox mode via env var
- Handle errors gracefully
- Return JSON responses

### 4. Add `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src"]
}
```

### 5. Test locally

```bash
cd packages/<category>/<service>
npm install
npm run build
ASAAS_API_KEY=test node dist/index.js
```

### 6. Submit a PR

- Branch: `feat/<service>-mcp`
- Include a README.md in the server directory with usage examples
- Update the root README.md table

## Code Guidelines

- TypeScript strict mode
- Use `fetch` (Node.js built-in) — no external HTTP libraries
- Environment variables for all secrets
- Sandbox support for APIs that offer it
- Error messages should be clear and actionable
- JSON responses should be pretty-printed (`JSON.stringify(data, null, 2)`)

## Requesting a Server

If you want an MCP server for a Brazilian service that doesn't exist yet:

1. Open an [issue](https://github.com/codespar/mcp-brasil/issues)
2. Use the "server request" label
3. Include: service name, API docs URL, and main use cases

## License

All contributions are licensed under MIT.

## Contract tests (real provider sandbox)

Unit tests mock the network. Contract tests hit a provider's **sandbox** to
prove the integration really works. They live next to unit tests as
`src/__tests__/contract.test.ts` and are **skipped unless** the required
credential env var is set, so `npm test` stays green without credentials.

Run the Mercado Pago contract test locally:

1. Create a Mercado Pago app and copy its Access Token from the **Test credentials** section of the developer panel (it may start with `TEST-` or `APP_USR-` — what matters is that it comes from the *Test credentials* section, not Production).
2. Create `.env` at the repo root (gitignored):
   ```
   MP_TEST_ACCESS_TOKEN=TEST-...
   ```
3. Run:
   ```bash
   npx vitest run packages/payments/mercado-pago/src/__tests__/contract.test.ts
   ```

Never commit `.env` or any token. Use only **sandbox** credentials from the Test credentials section — never Production.

Run the BrasilAPI contract test locally. No credential is needed (the API is
public), so the gate is only an opt-in to hitting the network:

```bash
BRASIL_API_CONTRACT=1 npx vitest run packages/identity/brasil-api/src/__tests__/contract.test.ts
```

It covers a case a mocked test cannot see: BrasilAPI's edge answers `403` to
the User-Agent Node's `fetch` sends by default, so `get_cnpj` only works while
the server sets its own User-Agent header.

**A package that adds a contract test must exclude tests from its build.**
`test-utils/contract.ts` lives outside every package's `rootDir`, so a
`tsconfig.json` without `"exclude": ["src/__tests__"]` makes `npm run build`
fail *and* emit a CommonJS `test-utils/contract.js` next to it, which then
breaks every contract test file in the repo with "Vitest cannot be imported in
a CommonJS module using require()". Add the `exclude` in the same commit.

### Why this matters (for maintainers)

Every existing test in this repo mocks the network (`vi.mock` + `global.fetch`).
A mocked test stays green even if the provider's real API changed and the
server is broken — it asserts the mock, not the provider. Contract tests
close that gap: they hit the provider's real sandbox so a broken integration
actually fails.

**Adoption is zero-risk.** Contract tests are gated by a credential env var
and `describe.skipIf`. With no credential (default CI, any contributor without
a token) the whole block is **skipped** and `npm test` stays green. Merging
contract tests never breaks CI or anyone's local run. They only execute for
someone who opts in by providing a sandbox token in `.env`.

**Assertions are by class, not exact codes.** Success ⇒ `!isError`; failure ⇒
`isError` + a `4xx`/`5xx` match. This keeps the suite robust instead of
overfitting to a specific status (e.g. Mercado Pago returns `400`, not `404`,
for an invalid payment id — discovered by running this for real).

**Credential-class caveat (read before extending).** For the Mercado Pago
suite, several write endpoints (`create_customer`, `create_payment`,
`create_subscription`, store/balance ops) assert a *documented error
contract* (`isError` + `401/403/4xx`). This reflects the verified behavior of
an **application "Test credentials" Access Token**: with that credential class
Mercado Pago returns `401 "Unauthorized use of live credentials"` /
`403` for those operations, regardless of payer email (the official
`@testuser.com` guidance was tested against the live API and did not change
this — see the inline comments quoting each exact MP status/message). If you
run the suite with a *broader* credential (e.g. a token generated by logging
in as a test user) some of those endpoints may instead succeed — those
`expect(isError).toBe(true)` assertions would then fail. That failure is an
intended signal, not a flake: it means your credential does more, so promote
those tests to real-success assertions. The error-contract form documents the
contract for the most common credential class; it is not a claim that the
operation is impossible.

**Reusable harness.** `test-utils/contract.ts` (repo-root, dev-only, never
published) provides the gate, env loading, result parsing and a credential
guard. The same pattern applies to any other server (asaas, zoop, …) — the
path from "109 servers" to "N servers with proven integration".
