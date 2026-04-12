#!/usr/bin/env node

/**
 * MCP Server for Nequi — Colombian digital wallet (50M+ users, by Bancolombia).
 *
 * Tools:
 * - create_push_payment: Send a push payment notification to a Nequi user
 * - get_payment_status: Check payment status
 * - create_qr_payment: Generate a QR code payment
 * - reverse_payment: Reverse a payment
 * - get_subscription: Get subscription details
 * - unsubscribe: Cancel a subscription
 *
 * Environment:
 *   NEQUI_API_KEY       — API key
 *   NEQUI_CLIENT_ID     — OAuth2 client ID
 *   NEQUI_CLIENT_SECRET — OAuth2 client secret
 *   NEQUI_ENV           — "sandbox" or "production" (default: sandbox)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.NEQUI_API_KEY || "";
const CLIENT_ID = process.env.NEQUI_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NEQUI_CLIENT_SECRET || "";
const NEQUI_ENV = process.env.NEQUI_ENV || "sandbox";
const BASE_URL = NEQUI_ENV === "production"
  ? "https://api.nequi.com"
  : "https://api.sandbox.nequi.com";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getOAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Nequi OAuth failed: ${res.status}`);
  const data = await res.json() as any;
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function nequiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getOAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
    "x-api-key": API_KEY,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nequi API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-nequi", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_push_payment",
      description: "Send a push payment notification to a Nequi user",
      inputSchema: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Nequi phone number (10 digits)" },
          code: { type: "string", description: "Merchant payment code" },
          value: { type: "string", description: "Payment amount in COP" },
          merchant_id: { type: "string", description: "Merchant ID" },
          message: { type: "string", description: "Payment message/description" },
        },
        required: ["phone_number", "code", "value"],
      },
    },
    {
      name: "get_payment_status",
      description: "Check the status of a payment",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Payment code" },
          merchant_id: { type: "string", description: "Merchant ID" },
        },
        required: ["code"],
      },
    },
    {
      name: "create_qr_payment",
      description: "Generate a QR code for payment",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Payment code" },
          value: { type: "string", description: "Payment amount in COP" },
          merchant_id: { type: "string", description: "Merchant ID" },
          message: { type: "string", description: "Payment description" },
        },
        required: ["code", "value"],
      },
    },
    {
      name: "reverse_payment",
      description: "Reverse a completed payment",
      inputSchema: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Nequi phone number" },
          code: { type: "string", description: "Original payment code" },
          value: { type: "string", description: "Amount to reverse" },
          merchant_id: { type: "string", description: "Merchant ID" },
          transaction_id: { type: "string", description: "Original transaction ID" },
        },
        required: ["phone_number", "code", "value", "transaction_id"],
      },
    },
    {
      name: "get_subscription",
      description: "Get subscription details for a phone number",
      inputSchema: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Nequi phone number" },
          code: { type: "string", description: "Subscription code" },
          merchant_id: { type: "string", description: "Merchant ID" },
        },
        required: ["phone_number", "code"],
      },
    },
    {
      name: "unsubscribe",
      description: "Cancel a subscription",
      inputSchema: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Nequi phone number" },
          code: { type: "string", description: "Subscription code" },
          merchant_id: { type: "string", description: "Merchant ID" },
          token: { type: "string", description: "Subscription token" },
        },
        required: ["phone_number", "code", "token"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_push_payment":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-paymentservice-unregisteredpayment", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                unregisteredPaymentRQ: {
                  phoneNumber: args?.phone_number,
                  code: args?.code,
                  value: args?.value,
                  merchantId: args?.merchant_id,
                  message: args?.message,
                },
              },
            },
          },
        }), null, 2) }] };
      case "get_payment_status":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-paymentservice-getstatuspayment", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                getStatusPaymentRQ: {
                  codeQR: args?.code,
                  merchantId: args?.merchant_id,
                },
              },
            },
          },
        }), null, 2) }] };
      case "create_qr_payment":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-paymentservice-generatecodeqr", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                generateCodeQRRQ: {
                  code: args?.code,
                  value: args?.value,
                  merchantId: args?.merchant_id,
                  message: args?.message,
                },
              },
            },
          },
        }), null, 2) }] };
      case "reverse_payment":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-reverseservices-reversetransaction", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                reverseTransactionRQ: {
                  phoneNumber: args?.phone_number,
                  code: args?.code,
                  value: args?.value,
                  merchantId: args?.merchant_id,
                  transactionId: args?.transaction_id,
                },
              },
            },
          },
        }), null, 2) }] };
      case "get_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-subscriptionpaymentservice-getsubscription", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                getSubscriptionRQ: {
                  phoneNumber: args?.phone_number,
                  code: args?.code,
                  merchantId: args?.merchant_id,
                },
              },
            },
          },
        }), null, 2) }] };
      case "unsubscribe":
        return { content: [{ type: "text", text: JSON.stringify(await nequiRequest("POST", "/payments/v2/-services-subscriptionpaymentservice-deletesubscription", {
          RequestMessage: {
            RequestHeader: { Channel: "PNP04-C001", RequestDate: new Date().toISOString(), MessageID: `MCP-${Date.now()}`, ClientID: CLIENT_ID },
            RequestBody: {
              any: {
                deleteSubscriptionRQ: {
                  phoneNumber: args?.phone_number,
                  code: args?.code,
                  merchantId: args?.merchant_id,
                  token: args?.token,
                },
              },
            },
          },
        }), null, 2) }] };
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
        const s = new Server({ name: "mcp-nequi", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
