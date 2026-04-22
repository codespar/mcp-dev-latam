#!/usr/bin/env node

/**
 * MCP Server for NFe.io — Brazilian fiscal document platform.
 *
 * Tools (Tier 1 — emission + lifecycle):
 *   create_nfse       Issue an NFS-e (service invoice)
 *   get_nfse          Get one NFS-e by id
 *   cancel_nfse       Cancel an NFS-e
 *   create_nfe        Issue an NF-e (product invoice)
 *   get_nfe           Get one NF-e by id
 *   cancel_nfe        Cancel an NF-e
 *
 * Tools (Tier 2 — operational helpers):
 *   list_nfse         List NFS-e with pagination + status filter
 *   list_nfe          List NF-e with pagination + status filter
 *   email_nfse        Email an NFS-e PDF to a recipient
 *   consult_cnpj      Look up Brazilian company data by CNPJ
 *   consult_cep       Resolve a Brazilian postal code to an address
 *   get_nfe_pdf       Download the DANFE PDF URL for an NF-e
 *
 * Authentication:
 *   NFEIO_API_KEY — single API key, sent as `Authorization: <key>`. NFe.io
 *     supports separate keys for issuance vs queries, but one key with
 *     both scopes works for most setups — follow the principle of least
 *     privilege and use two if your account allows it.
 *   NFEIO_COMPANY_ID — optional default company id (or CNPJ). Per-call
 *     arguments override this.
 *
 * Hosts (NFe.io segments the API across 3 hostnames):
 *   api.nfse.io         — product invoices (NF-e)
 *   api.nfe.io          — service invoices (NFS-e) + company mgmt
 *   nfe.api.nfe.io      — query/lookup (CNPJ, CEP)
 *
 * Demo mode: pass `--demo` or set MCP_DEMO=true to return canned
 * responses without touching the network. Useful for docs + CI.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEMO_MODE = process.argv.includes("--demo") || process.env.MCP_DEMO === "true";

const API_KEY = process.env.NFEIO_API_KEY || "";
const DEFAULT_COMPANY_ID = process.env.NFEIO_COMPANY_ID || "";

const NFSE_BASE = "https://api.nfe.io";
const NFE_BASE = "https://api.nfse.io";
const QUERY_BASE = "https://nfe.api.nfe.io";

const DEMO_RESPONSES: Record<string, unknown> = {
  create_nfse: {
    id: "nfse_demo_001",
    flowStatus: "Issued",
    rpsSerialNumber: "1",
    rpsNumber: 101,
    servicesAmount: 500.0,
    issuedOn: "2026-04-22T10:30:00Z",
    pdfUrl: "https://api.nfe.io/demo/nfse.pdf",
  },
  get_nfse: {
    id: "nfse_demo_001",
    flowStatus: "Issued",
    rpsNumber: 101,
    servicesAmount: 500.0,
  },
  cancel_nfse: { id: "nfse_demo_001", flowStatus: "Cancelled" },
  list_nfse: {
    totalResults: 1,
    totalPages: 1,
    page: 1,
    serviceInvoices: [{ id: "nfse_demo_001", flowStatus: "Issued" }],
  },
  email_nfse: { accepted: true, to: "cliente@demo.com" },
  create_nfe: {
    id: "nfe_demo_001",
    status: "Authorized",
    number: 1234,
    series: 1,
    accessKey: "35260412345678000190550010000012341000000001",
    totalAmount: 150.0,
    issuedOn: "2026-04-22T10:30:00Z",
    danfeUrl: "https://api.nfse.io/demo/danfe.pdf",
    xmlUrl: "https://api.nfse.io/demo/nfe.xml",
  },
  get_nfe: {
    id: "nfe_demo_001",
    status: "Authorized",
    accessKey: "35260412345678000190550010000012341000000001",
  },
  cancel_nfe: { id: "nfe_demo_001", status: "Cancelled" },
  list_nfe: {
    totalResults: 1,
    totalPages: 1,
    page: 1,
    productInvoices: [{ id: "nfe_demo_001", status: "Authorized" }],
  },
  get_nfe_pdf: { pdfUrl: "https://api.nfse.io/demo/danfe.pdf" },
  consult_cnpj: {
    cnpj: "12345678000190",
    legalName: "Demo Comércio LTDA",
    tradeName: "Demo Shop",
    status: "ATIVA",
    state: "SP",
  },
  consult_cep: {
    postalCode: "01001000",
    street: "Praça da Sé",
    district: "Sé",
    city: "São Paulo",
    state: "SP",
  },
};

/**
 * Issue an authenticated request to one of the NFe.io hosts. Errors are
 * surfaced with status + body so callers can act on specific 4xx codes
 * (e.g. 409 cancellation-window-expired, 422 validation).
 */
async function nfeioRequest(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (!API_KEY) {
    throw new Error("NFEIO_API_KEY is not set");
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NFe.io ${method} ${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function companyIdOrThrow(arg: unknown): string {
  const id = typeof arg === "string" && arg.length > 0 ? arg : DEFAULT_COMPANY_ID;
  if (!id) {
    throw new Error(
      "company_id not provided and NFEIO_COMPANY_ID not set — pass company_id in the call or export NFEIO_COMPANY_ID",
    );
  }
  return id;
}

const server = new Server(
  { name: "mcp-nfe-io", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_nfse",
      description:
        "Issue an NFS-e (service invoice). Returns the invoice with flowStatus, rpsNumber, and PDF URL once processed.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: {
            type: "string",
            description: "Company id or CNPJ (falls back to NFEIO_COMPANY_ID)",
          },
          cityServiceCode: {
            type: "string",
            description: "Municipal service code (varies per city)",
          },
          description: { type: "string", description: "Service description" },
          servicesAmount: {
            type: "number",
            description: "Total service amount in BRL",
          },
          borrower: {
            type: "object",
            description:
              "Service taker. Shape: { federalTaxNumber, name, email?, address? }",
          },
          rpsSerialNumber: { type: "string", description: "RPS series (optional)" },
          rpsNumber: {
            type: "number",
            description: "RPS sequential number (optional; auto-assigned if omitted)",
          },
          additionalInformation: {
            type: "string",
            description: "Free-form notes on the invoice",
          },
        },
        required: ["cityServiceCode", "description", "servicesAmount", "borrower"],
      },
    },
    {
      name: "get_nfse",
      description: "Fetch a single NFS-e by id.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Service invoice id" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_nfse",
      description:
        "Cancel an NFS-e. Some municipalities only allow cancellation within a short window (commonly 30 days).",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Service invoice id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_nfse",
      description: "List NFS-e with pagination + optional flowStatus filter.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          pageCount: {
            type: "number",
            description: "Results per page (default 50)",
          },
          pageIndex: { type: "number", description: "Page index (0-based)" },
          flowStatus: {
            type: "string",
            enum: [
              "Issued",
              "Cancelled",
              "WaitingSend",
              "WaitingReturn",
              "IssuedError",
              "CancelError",
            ],
            description: "Filter by invoice status",
          },
        },
      },
    },
    {
      name: "email_nfse",
      description: "Email the PDF of an already-issued NFS-e to a recipient.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Service invoice id" },
          to: { type: "string", description: "Recipient email" },
        },
        required: ["id", "to"],
      },
    },
    {
      name: "create_nfe",
      description:
        "Issue an NF-e (product invoice). Returns the invoice with status, access key (chave), and DANFE URL once authorized.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: {
            type: "string",
            description: "Company id or CNPJ (falls back to NFEIO_COMPANY_ID)",
          },
          environment: {
            type: "string",
            enum: ["Development", "Production"],
            description: "Emission environment",
          },
          buyer: {
            type: "object",
            description:
              "Buyer data. Shape: { federalTaxNumber, name, email?, address? }",
          },
          operation: {
            type: "string",
            description:
              "Nature of operation (natureza da operação), e.g. 'Venda de mercadoria'",
          },
          products: {
            type: "array",
            description:
              "Line items. Each: { code, description, quantity, unitAmount, ncm, cfop }",
          },
          payment: {
            type: "object",
            description:
              "Payment data (method, amount, installments)",
          },
        },
        required: ["environment", "buyer", "operation", "products"],
      },
    },
    {
      name: "get_nfe",
      description: "Fetch a single NF-e by id.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Product invoice id" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_nfe",
      description:
        "Cancel an NF-e. Must include a justification of at least 15 characters.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Product invoice id" },
          justification: {
            type: "string",
            description: "Cancellation reason (min 15 chars)",
          },
        },
        required: ["id", "justification"],
      },
    },
    {
      name: "list_nfe",
      description: "List NF-e with pagination + optional status filter.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          pageCount: { type: "number", description: "Results per page (default 50)" },
          pageIndex: { type: "number", description: "Page index (0-based)" },
          status: {
            type: "string",
            description: "Filter by invoice status (Authorized, Cancelled, etc.)",
          },
        },
      },
    },
    {
      name: "get_nfe_pdf",
      description:
        "Return the DANFE PDF URL for an issued NF-e. PDFs are generated asynchronously; call again if not ready.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "Company id (falls back to env)" },
          id: { type: "string", description: "Product invoice id" },
        },
        required: ["id"],
      },
    },
    {
      name: "consult_cnpj",
      description: "Look up Brazilian company data (razão social, status, address) by CNPJ.",
      inputSchema: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ (14 digits, numbers only)" },
        },
        required: ["cnpj"],
      },
    },
    {
      name: "consult_cep",
      description: "Resolve a Brazilian postal code (CEP) to a full address.",
      inputSchema: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP (8 digits, numbers only)" },
        },
        required: ["cep"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;

  if (DEMO_MODE) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            DEMO_RESPONSES[name] || { demo: true, tool: name, args: a },
            null,
            2,
          ),
        },
      ],
    };
  }

  try {
    let result: unknown;
    switch (name) {
      case "create_nfse": {
        const cid = companyIdOrThrow(a.company_id);
        const { company_id: _c, ...body } = a;
        result = await nfeioRequest(NFSE_BASE, "POST", `/v1/companies/${cid}/serviceinvoices`, body);
        break;
      }
      case "get_nfse": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(NFSE_BASE, "GET", `/v1/companies/${cid}/serviceinvoices/${a.id}`);
        break;
      }
      case "cancel_nfse": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(NFSE_BASE, "DELETE", `/v1/companies/${cid}/serviceinvoices/${a.id}`);
        break;
      }
      case "list_nfse": {
        const cid = companyIdOrThrow(a.company_id);
        const params = new URLSearchParams();
        if (typeof a.pageCount === "number") params.set("pageCount", String(a.pageCount));
        if (typeof a.pageIndex === "number") params.set("pageIndex", String(a.pageIndex));
        if (typeof a.flowStatus === "string") params.set("flowStatus", a.flowStatus);
        const qs = params.toString();
        result = await nfeioRequest(
          NFSE_BASE,
          "GET",
          `/v1/companies/${cid}/serviceinvoices${qs ? `?${qs}` : ""}`,
        );
        break;
      }
      case "email_nfse": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(
          NFSE_BASE,
          "POST",
          `/v1/companies/${cid}/serviceinvoices/${a.id}/sendemail`,
          { to: a.to },
        );
        break;
      }
      case "create_nfe": {
        const cid = companyIdOrThrow(a.company_id);
        const { company_id: _c, ...body } = a;
        result = await nfeioRequest(NFE_BASE, "POST", `/v2/companies/${cid}/productinvoices`, body);
        break;
      }
      case "get_nfe": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(NFE_BASE, "GET", `/v2/companies/${cid}/productinvoices/${a.id}`);
        break;
      }
      case "cancel_nfe": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(
          NFE_BASE,
          "DELETE",
          `/v2/companies/${cid}/productinvoices/${a.id}`,
          { justification: a.justification },
        );
        break;
      }
      case "list_nfe": {
        const cid = companyIdOrThrow(a.company_id);
        const params = new URLSearchParams();
        if (typeof a.pageCount === "number") params.set("pageCount", String(a.pageCount));
        if (typeof a.pageIndex === "number") params.set("pageIndex", String(a.pageIndex));
        if (typeof a.status === "string") params.set("status", a.status);
        const qs = params.toString();
        result = await nfeioRequest(
          NFE_BASE,
          "GET",
          `/v2/companies/${cid}/productinvoices${qs ? `?${qs}` : ""}`,
        );
        break;
      }
      case "get_nfe_pdf": {
        const cid = companyIdOrThrow(a.company_id);
        result = await nfeioRequest(NFE_BASE, "GET", `/v2/companies/${cid}/productinvoices/${a.id}/pdf`);
        break;
      }
      case "consult_cnpj": {
        result = await nfeioRequest(QUERY_BASE, "GET", `/v1/legalentities/${a.cnpj}`);
        break;
      }
      case "consult_cep": {
        result = await nfeioRequest(QUERY_BASE, "GET", `/v1/addresses/${a.cep}`);
        break;
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: any, res: any) =>
      res.json({ status: "ok", sessions: transports.size }),
    );
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) {
        await transports.get(sid)!.handleRequest(req, res, req.body);
        return;
      }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, t);
          },
        });
        t.onclose = () => {
          if (t.sessionId) transports.delete(t.sessionId);
        };
        const s = new Server(
          { name: "mcp-nfe-io", version: "0.1.0" },
          { capabilities: { tools: {} } },
        );
        (server as any)._requestHandlers.forEach((v: any, k: any) =>
          (s as any)._requestHandlers.set(k, v),
        );
        (server as any)._notificationHandlers?.forEach((v: any, k: any) =>
          (s as any)._notificationHandlers.set(k, v),
        );
        await s.connect(t);
        await t.handleRequest(req, res, req.body);
        return;
      }
      res
        .status(400)
        .json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string;
      if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res);
      else res.status(400).send("Invalid session");
    });
    app.delete("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string;
      if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res);
      else res.status(400).send("Invalid session");
    });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => {
      console.error(`MCP HTTP server on http://localhost:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
