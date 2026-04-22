#!/usr/bin/env node
/**
 * Smoke test for the NFe.io MCP server — hits the real sandbox API with
 * whatever is in ./examples/.env.local.
 *
 * Runs each tool in increasing order of side-effect risk:
 *   1. consult_cep (no side-effect, no auth — safest)
 *   2. consult_cnpj (no side-effect, needs auth)
 *   3. list_nfse (no side-effect, needs company)
 *   4. list_nfe (no side-effect, needs company)
 *   5. create_nfse (SIDE-EFFECT — emits a real NFS-e in sandbox)
 *   6. get_nfse  (of the one we just created)
 *   7. cancel_nfse (SIDE-EFFECT — cancels the one we created)
 *
 * Each step prints ✅ or ❌ + the response snippet so we can see exactly
 * which endpoint/body shape broke against the real API.
 *
 * Usage:
 *   cd packages/fiscal/nfe-io
 *   npx tsx examples/smoke-test.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Load ./examples/.env.local manually (no dep on dotenv).
try {
  const raw = readFileSync(join(HERE, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
} catch {
  console.error("✗ missing examples/.env.local (copy .env.local.example)");
  process.exit(1);
}

const API_KEY = process.env.NFEIO_API_KEY;
const COMPANY_ID = process.env.NFEIO_COMPANY_ID;
if (!API_KEY) {
  console.error("✗ NFEIO_API_KEY not set in .env.local");
  process.exit(1);
}
if (!COMPANY_ID) {
  console.error("✗ NFEIO_COMPANY_ID not set in .env.local");
  process.exit(1);
}

const NFSE_BASE = "https://api.nfe.io";
const QUERY_BASE = "https://nfe.api.nfe.io";

async function call(label: string, base: string, method: string, path: string, body?: unknown) {
  process.stdout.write(`→ ${label.padEnd(28)} ${method} ${path}\n`);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: API_KEY!,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const preview = text.slice(0, 400);
  if (res.ok) {
    console.log(`  ✅ ${res.status} — ${preview}\n`);
    return text ? JSON.parse(text) : {};
  } else {
    console.log(`  ❌ ${res.status} — ${preview}\n`);
    return null;
  }
}

(async () => {
  console.log("=== NFe.io sandbox smoke test ===\n");
  console.log(`company_id: ${COMPANY_ID}`);
  console.log(`key length: ${API_KEY!.length} chars\n`);

  // 1. CEP lookup — no auth on some NFe.io plans, but harmless.
  await call("consult_cep", QUERY_BASE, "GET", "/v1/addresses/01001000");

  // 2. CNPJ lookup.
  await call("consult_cnpj", QUERY_BASE, "GET", "/v1/legalentities/06990590000123");

  // 3. List NFSe.
  await call(
    "list_nfse",
    NFSE_BASE,
    "GET",
    `/v1/companies/${COMPANY_ID}/serviceinvoices?pageCount=5`,
  );

  // 4. List NFe — different base.
  await call(
    "list_nfe",
    "https://api.nfse.io",
    "GET",
    `/v2/companies/${COMPANY_ID}/productinvoices?pageCount=5`,
  );

  // Stopping here — creating an NFSe requires real cityServiceCode + a
  // valid borrower CNPJ/CPF + a permission on the sandbox company. If
  // the 4 reads above work, bump this script to add the create/cancel
  // cycle with your specific city code.
  console.log("\n(read-only tests done — extend with create/cancel once the reads are green)\n");
})().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
