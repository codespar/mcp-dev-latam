#!/usr/bin/env node

/**
 * MCP Server for Celcoin — Brazilian fintech infrastructure (Pix, boleto, transfers, top-ups).
 *
 * Tools:
 * - create_pix_payment: Create a Pix payment (Pix Out / P2P send)
 * - get_pix_payment: Get Pix payment details
 * - create_pix_cob: Create a Pix immediate charge (cob)
 * - get_pix_cob: Get a Pix immediate charge by txid
 * - create_pix_cobv: Create a Pix due charge (cobv) with vencimento
 * - lookup_pix_dict: Lookup a Pix DICT key (resolve key to account holder)
 * - create_pix_devolution: Create a Pix devolução (refund)
 * - cancel_boleto: Cancel a boleto issued via the bill-issuance product
 * - read_barcode: Authorize (consult) a boleto / concessionária barcode before paying
 * - pay_bill: Confirm payment of a previously authorized bill (boleto / concessionária)
 * - create_boleto: Issue a boleto via the bill-issuance product
 * - get_boleto: Get an issued boleto's details
 * - create_transfer: Create a bank transfer (TED)
 * - get_balance: Get account balance
 * - get_statement: Get account statement (extrato)
 * - list_banks: List available banks
 * - list_topup_providers: List telecom top-up providers (operadoras)
 * - create_topup: Create a mobile/service top-up (recarga)
 *
 * Environment:
 *   CELCOIN_CLIENT_ID — OAuth2 client ID
 *   CELCOIN_CLIENT_SECRET — OAuth2 client secret
 *   CELCOIN_SANDBOX — "true" to use sandbox (default: false)
 *   CELCOIN_BASE_URL — override the API host (default: production
 *     https://api.openfinance.celcoin.com.br, sandbox
 *     https://sandbox.openfinance.celcoin.dev). Celcoin only accepts
 *     production calls over mTLS from IPs registered with them in advance,
 *     and this server does not present a client certificate: in production,
 *     point CELCOIN_BASE_URL at a proxy that terminates the mTLS.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.CELCOIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CELCOIN_CLIENT_SECRET || "";
const BASE_URL = process.env.CELCOIN_BASE_URL || (process.env.CELCOIN_SANDBOX === "true"
  ? "https://sandbox.openfinance.celcoin.dev"
  : "https://api.openfinance.celcoin.com.br");

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch(`${BASE_URL}/v5/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Celcoin OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function celcoinRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Celcoin API ${res.status}: ${err}`);
  }
  return res.json();
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-celcoin", version: "0.2.3" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_pix_payment",
      description: "Create a Pix payment via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          pixKey: { type: "string", description: "Recipient Pix key" },
          pixKeyType: { type: "string", enum: ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"], description: "Pix key type" },
          recipientName: { type: "string", description: "Recipient name" },
          recipientDocument: { type: "string", description: "Recipient CPF/CNPJ" },
          description: { type: "string", description: "Payment description" },
          endToEndId: { type: "string", description: "End-to-end ID (optional)" },
        },
        required: ["amount", "pixKey", "pixKeyType"],
      },
    },
    {
      name: "get_pix_payment",
      description: "Get Pix payment details by transaction ID",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "create_pix_cob",
      description: "Create a Pix immediate charge (cob) — generates QR code / copia-e-cola for payer",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          pixKey: { type: "string", description: "Beneficiary Pix key (chave do recebedor)" },
          payerDocument: { type: "string", description: "Payer CPF/CNPJ (optional)" },
          payerName: { type: "string", description: "Payer name (optional)" },
          description: { type: "string", description: "Charge description / solicitacaoPagador" },
          expiration: { type: "number", description: "Expiration in seconds (default 3600)" },
        },
        required: ["amount", "pixKey"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Get a Pix immediate charge by transactionId or txid",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Celcoin transactionId (or txid)" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "create_pix_cobv",
      description: "Create a Pix due charge (cobv) — boleto-like Pix with due date",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          pixKey: { type: "string", description: "Beneficiary Pix key" },
          dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          payerDocument: { type: "string", description: "Payer CPF/CNPJ" },
          payerName: { type: "string", description: "Payer name" },
          description: { type: "string", description: "Charge description" },
          daysAfterDue: { type: "number", description: "Days payer can still pay after due date" },
        },
        required: ["amount", "pixKey", "dueDate", "payerDocument", "payerName"],
      },
    },
    {
      name: "lookup_pix_dict",
      description: "Lookup a Pix DICT key — resolves a Pix key to account holder + bank info",
      inputSchema: {
        type: "object",
        properties: {
          pixKey: { type: "string", description: "Pix key (CPF/CNPJ/email/phone/EVP)" },
          payerDocument: { type: "string", description: "Document of the requester (payer side, required by DICT rules)" },
        },
        required: ["pixKey"],
      },
    },
    {
      name: "create_pix_devolution",
      description: "Create a Pix devolução (refund) — refund a received Pix transaction",
      inputSchema: {
        type: "object",
        properties: {
          endToEndId: { type: "string", description: "Original Pix end-to-end ID (E2E)" },
          amount: { type: "number", description: "Refund amount in BRL" },
          description: { type: "string", description: "Refund reason / description" },
        },
        required: ["endToEndId", "amount"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel an issued boleto by transactionId",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Boleto transactionId" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "read_barcode",
      description: "Authorize (consult) a boleto / concessionária barcode before paying — returns transactionId, amount, totalUpdated, allowChangeValue, dueDate. The transactionId opens a reservation window; pass it to pay_bill as transactionIdAuthorize.",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "Digitable line (linha digitável) — 47 or 48 digits" },
          barcodeType: { type: "number", enum: [1, 2], description: "Barcode category: 1 = concessionária/utility (arrecadação), 2 = bank slip (ficha de compensação). Defaults to 2." },
        },
        required: ["barcode"],
      },
    },
    {
      name: "pay_bill",
      description: "Confirm payment of a bill (boleto bancário or concessionária) previously authorized with read_barcode. Requires transactionIdAuthorize from the authorize step.",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "Digitable line (linha digitável)" },
          barcodeType: { type: "number", enum: [1, 2], description: "Barcode category: 1 = concessionária/utility, 2 = bank slip. Defaults to 2." },
          transactionIdAuthorize: { type: "string", description: "transactionId returned by read_barcode (the authorize step). Required so Celcoin matches the confirm to the reservation." },
          amount: { type: "number", description: "Amount in BRL. Must equal the authorize totalUpdated unless allowChangeValue was true." },
          originalValue: { type: "number", description: "Original face value of the bill (from authorize). Optional." },
          valueWithDiscount: { type: "number", description: "Value after discount, if any. Optional." },
          valueWithAdditional: { type: "number", description: "Value including interest/fine, if any. Optional." },
          dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          cpfcnpj: { type: "string", description: "Payer CPF/CNPJ (documento do pagador)" },
          externalNSU: { type: "number", description: "Caller-side transaction identifier (optional)." },
          externalTerminal: { type: "string", description: "Caller-side terminal / client identifier (optional)." },
        },
        required: ["barcode", "amount", "transactionIdAuthorize"],
      },
    },
    {
      name: "get_statement",
      description: "Get account statement (extrato) for a date range",
      inputSchema: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Start date (YYYY-MM-DD)" },
          dateTo: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number (optional)" },
          limit: { type: "number", description: "Items per page (optional)" },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
    {
      name: "list_topup_providers",
      description: "List telecom top-up providers (operadoras) available for recargas",
      inputSchema: {
        type: "object",
        properties: {
          phoneNumber: { type: "string", description: "Phone number (optional, to auto-detect operator)" },
        },
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto payment via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          payerName: { type: "string", description: "Payer name" },
          payerDocument: { type: "string", description: "Payer CPF/CNPJ" },
          payerAddress: {
            type: "object",
            description: "Payer address",
            properties: {
              street: { type: "string" },
              number: { type: "string" },
              neighborhood: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              zipCode: { type: "string" },
            },
          },
          description: { type: "string", description: "Boleto description" },
        },
        required: ["amount", "dueDate", "payerName", "payerDocument"],
      },
    },
    {
      name: "get_boleto",
      description: "Get boleto details by transaction ID",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a bank transfer (TED/DOC) via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          bankCode: { type: "string", description: "Recipient bank code (ISPB or COMPE)" },
          branch: { type: "string", description: "Recipient branch number" },
          account: { type: "string", description: "Recipient account number" },
          accountType: { type: "string", enum: ["CC", "CP", "PG"], description: "CC=Checking, CP=Savings, PG=Payment" },
          recipientName: { type: "string", description: "Recipient name" },
          recipientDocument: { type: "string", description: "Recipient CPF/CNPJ" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["amount", "bankCode", "branch", "account", "accountType", "recipientName", "recipientDocument"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance at Celcoin",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_banks",
      description: "List available banks in Brazil (ISPB codes)",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by bank name or code" },
        },
      },
    },
    {
      name: "create_topup",
      description: "Create a mobile/service top-up (recarga) via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          phoneNumber: { type: "string", description: "Phone number with DDD (e.g., 11999999999)" },
          amount: { type: "number", description: "Top-up amount in BRL" },
          providerId: { type: "number", description: "Telecom provider ID" },
        },
        required: ["phoneNumber", "amount", "providerId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_pix_payment": {
        const payload = {
          amount: args?.amount,
          key: args?.pixKey,
          keyType: args?.pixKeyType,
          receiver: {
            name: args?.recipientName,
            document: args?.recipientDocument,
          },
          description: args?.description,
          endToEndId: args?.endToEndId,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/pix/v1/payment", payload), null, 2) }] };
      }
      case "get_pix_payment":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/pix/v1/payment/status/${args?.transactionId}`), null, 2) }] };
      case "create_pix_cob": {
        const payload = {
          amount: args?.amount,
          key: args?.pixKey,
          debtor: args?.payerDocument
            ? { document: args?.payerDocument, name: args?.payerName }
            : undefined,
          payerQuestion: args?.description,
          expiration: args?.expiration ?? 3600,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/pix/v1/brcode/static", payload), null, 2) }] };
      }
      case "get_pix_cob":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/pix/v1/brcode/${args?.transactionId}`), null, 2) }] };
      case "create_pix_cobv": {
        const payload = {
          amount: args?.amount,
          key: args?.pixKey,
          dueDate: args?.dueDate,
          debtor: { document: args?.payerDocument, name: args?.payerName },
          description: args?.description,
          daysAfterDue: args?.daysAfterDue,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/pix/v1/cobv", payload), null, 2) }] };
      }
      case "lookup_pix_dict": {
        const params = new URLSearchParams({ key: String(args?.pixKey ?? "") });
        if (args?.payerDocument) params.append("payerDocument", String(args.payerDocument));
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/pix/v1/dict?${params}`), null, 2) }] };
      }
      case "create_pix_devolution": {
        const payload = {
          endToEndId: args?.endToEndId,
          amount: args?.amount,
          description: args?.description,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/pix/v1/devolution", payload), null, 2) }] };
      }
      case "cancel_boleto":
        // Cancel an issued boleto under the bill-issuance product (billissuance),
        // not the bill-payment product. The v5/transactions/billpayments/* routes
        // are for *paying* a third-party slip and have no cancel-issued semantics.
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("DELETE", `/billissuance/v1/bill/${args?.transactionId}`), null, 2) }] };
      case "read_barcode": {
        // Authorize (consult) step: POST /v5/transactions/billpayments/authorize.
        // Opens a reservation keyed by the returned transactionId; that value is
        // passed to pay_bill as transactionIdAuthorize to confirm the payment.
        // The old GET .../billpayments?barCode= route returned 404.
        const payload = {
          barCode: {
            type: args?.barcodeType ?? 2,
            digitable: args?.barcode,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/billpayments/authorize", payload), null, 2) }] };
      }
      case "pay_bill": {
        // Confirm step: POST /v5/transactions/billpayments. The prior body sent a
        // bare `amount` and no transactionIdAuthorize, which Celcoin rejected with
        // errorCode 44 "Valor nao permitido". The confirm must carry the
        // transactionIdAuthorize from read_barcode plus the resolved billData.
        const payload = {
          externalNSU: args?.externalNSU,
          externalTerminal: args?.externalTerminal,
          cpfcnpj: args?.cpfcnpj,
          transactionIdAuthorize: args?.transactionIdAuthorize,
          billData: {
            value: args?.amount,
            originalValue: args?.originalValue ?? args?.amount,
            valueWithDiscount: args?.valueWithDiscount,
            valueWithAdditional: args?.valueWithAdditional,
          },
          barCode: {
            type: args?.barcodeType ?? 2,
            digitable: args?.barcode,
          },
          dueDate: args?.dueDate,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/billpayments", payload), null, 2) }] };
      }
      case "get_statement": {
        const params = new URLSearchParams({
          dateFrom: String(args?.dateFrom ?? ""),
          dateTo: String(args?.dateTo ?? ""),
        });
        if (args?.page) params.append("page", String(args.page));
        if (args?.limit) params.append("limit", String(args.limit));
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/v5/merchant/statement?${params}`), null, 2) }] };
      }
      case "list_topup_providers": {
        const params = args?.phoneNumber ? `?phoneNumber=${encodeURIComponent(String(args.phoneNumber))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/v5/transactions/topups/providers${params}`), null, 2) }] };
      }
      case "create_boleto":
        // Issue a new boleto via the bill-issuance product. The prior
        // /v5/transactions/billpayments/bankslip route returned 404 — that
        // namespace pays third-party slips, it does not issue them.
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/billissuance/v1/bill", args), null, 2) }] };
      case "get_boleto":
        // Query a boleto issued via the bill-issuance product by its id.
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/billissuance/v1/bill/${args?.transactionId}`), null, 2) }] };
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/transfer", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", "/v5/merchant/balance"), null, 2) }] };
      case "list_banks": {
        const params = args?.search ? `?name=${encodeURIComponent(String(args.search))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/v5/transactions/institutions${params}`), null, 2) }] };
      }
      case "create_topup": {
        const payload = {
          phoneNumber: args?.phoneNumber,
          value: args?.amount,
          providerId: args?.providerId,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/topups", payload), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-celcoin", version: "0.2.3" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
        await t.handleRequest(req, res, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
