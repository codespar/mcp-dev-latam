#!/usr/bin/env node

/**
 * MCP Server for PagSeguro/PagBank — Brazilian payment platform.
 *
 * Tools:
 * - create_order: Create an order (Pix, boleto, or credit card)
 * - get_order: Get order details by ID
 * - list_orders: List orders with filters
 * - pay_order: Pay an existing order
 * - create_charge: Create a standalone charge
 * - get_charge: Get charge details by ID
 * - list_charges: List charges with filters
 * - capture_charge: Capture a pre-authorized charge
 * - cancel_charge: Cancel a charge
 * - refund: Refund a charge (full or partial)
 * - get_pix_qrcode: Get Pix QR code payload for an order
 * - create_boleto: Create a boleto charge
 * - get_boleto: Get boleto details by ID
 * - get_public_keys: Get public key for card encryption
 * - create_payout: Create a payout/transfer to a bank account
 * - create_customer: Create a customer
 * - get_balance: Get account balance
 * - create_subscription: Create a recurring subscription plan
 * - list_subscriptions: List subscriptions with filters
 * - get_notifications: Get payment notification details
 * - create_split: Create a split payment configuration
 * - get_dispute: Get dispute/chargeback details
 * - create_webhook: Register an application webhook URL
 * - list_webhooks: List application webhooks
 *
 * Environment:
 *   PAGSEGURO_TOKEN — Bearer token from https://pagseguro.uol.com.br/
 *   PAGSEGURO_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.PAGSEGURO_TOKEN || "";
const BASE_URL = process.env.PAGSEGURO_BASE_URL || (process.env.PAGSEGURO_SANDBOX === "true"
  ? "https://sandbox.api.pagseguro.com"
  : "https://api.pagseguro.com");

async function pagseguroRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PagSeguro API ${res.status}: ${err}`);
  }
  return res.json();
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-pagseguro", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create an order in PagSeguro (Pix, boleto, or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your unique reference ID" },
          customer: {
            type: "object",
            description: "Customer data",
            properties: {
              name: { type: "string", description: "Customer name" },
              email: { type: "string", description: "Email address" },
              tax_id: { type: "string", description: "CPF or CNPJ (numbers only)" },
            },
            required: ["name", "email", "tax_id"],
          },
          items: {
            type: "array",
            description: "Order items",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                quantity: { type: "number", description: "Quantity" },
                unit_amount: { type: "number", description: "Unit price in cents (BRL)" },
              },
              required: ["name", "quantity", "unit_amount"],
            },
          },
          charges: {
            type: "array",
            description: "Payment charges (Pix, boleto, or card)",
            items: {
              type: "object",
              properties: {
                reference_id: { type: "string", description: "Charge reference" },
                amount: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "Amount in cents" },
                    currency: { type: "string", description: "Currency (BRL)" },
                  },
                  required: ["value"],
                },
                payment_method: {
                  type: "object",
                  description: "Payment method configuration",
                  properties: {
                    type: { type: "string", enum: ["PIX", "BOLETO", "CREDIT_CARD", "DEBIT_CARD"], description: "Payment type" },
                  },
                  required: ["type"],
                },
              },
              required: ["amount", "payment_method"],
            },
          },
        },
        required: ["customer", "items"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID (ORDE_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Filter by reference ID" },
          status: { type: "string", enum: ["CREATED", "PAID", "CANCELED", "IN_ANALYSIS"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "create_charge",
      description: "Create a standalone charge",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your reference ID" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Amount in cents (BRL)" },
              currency: { type: "string", description: "Currency (BRL)" },
            },
            required: ["value"],
          },
          payment_method: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["PIX", "BOLETO", "CREDIT_CARD"], description: "Payment type" },
            },
            required: ["type"],
          },
        },
        required: ["amount", "payment_method"],
      },
    },
    {
      name: "refund",
      description: "Refund a charge (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (CHAR_xxx)" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Refund amount in cents (omit for full refund)" },
            },
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "get_pix_qrcode",
      description: "Get Pix QR code payload and image for an order charge",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in PagSeguro",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Email address" },
          tax_id: { type: "string", description: "CPF or CNPJ (numbers only)" },
          phones: {
            type: "array",
            description: "Phone numbers",
            items: {
              type: "object",
              properties: {
                country: { type: "string", description: "Country code (55)" },
                area: { type: "string", description: "Area code (DDD)" },
                number: { type: "string", description: "Phone number" },
                type: { type: "string", enum: ["MOBILE", "BUSINESS", "HOME"], description: "Phone type" },
              },
              required: ["country", "area", "number"],
            },
          },
        },
        required: ["name", "email", "tax_id"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription plan in PagSeguro",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your unique reference ID" },
          plan: {
            type: "object",
            description: "Subscription plan details",
            properties: {
              name: { type: "string", description: "Plan name" },
              interval: {
                type: "object",
                properties: {
                  unit: { type: "string", enum: ["MONTH", "YEAR"], description: "Billing interval unit" },
                  length: { type: "number", description: "Number of units between charges" },
                },
                required: ["unit", "length"],
              },
              amount: {
                type: "object",
                properties: {
                  value: { type: "number", description: "Amount in cents (BRL)" },
                  currency: { type: "string", description: "Currency (BRL)" },
                },
                required: ["value"],
              },
            },
            required: ["name", "interval", "amount"],
          },
          customer: {
            type: "object",
            description: "Customer data (name, email, tax_id)",
          },
          payment_method: {
            type: "object",
            description: "Payment method (type: CREDIT_CARD or BOLETO)",
          },
        },
        required: ["plan", "customer", "payment_method"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List subscriptions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Filter by reference ID" },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "CANCELED", "PENDING"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_notifications",
      description: "Get payment notification details by notification code",
      inputSchema: {
        type: "object",
        properties: {
          notificationCode: { type: "string", description: "Notification code received via webhook" },
        },
        required: ["notificationCode"],
      },
    },
    {
      name: "create_split",
      description: "Create a split payment configuration for marketplace transactions",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID to split" },
          receivers: {
            type: "array",
            description: "Split receivers",
            items: {
              type: "object",
              properties: {
                account_id: { type: "string", description: "Receiver PagSeguro account ID" },
                amount: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "Receiver amount in cents" },
                  },
                  required: ["value"],
                },
              },
              required: ["account_id", "amount"],
            },
          },
        },
        required: ["charge_id", "receivers"],
      },
    },
    {
      name: "get_dispute",
      description: "Get dispute/chargeback details by ID",
      inputSchema: {
        type: "object",
        properties: {
          dispute_id: { type: "string", description: "Dispute ID" },
        },
        required: ["dispute_id"],
      },
    },
    {
      name: "pay_order",
      description: "Pay an existing order (attach a charge/payment to an order in CREATED state)",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID (ORDE_xxx)" },
          charges: {
            type: "array",
            description: "Charges to attach to the order",
            items: {
              type: "object",
              properties: {
                reference_id: { type: "string", description: "Charge reference" },
                amount: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "Amount in cents" },
                    currency: { type: "string", description: "Currency (BRL)" },
                  },
                  required: ["value"],
                },
                payment_method: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["PIX", "BOLETO", "CREDIT_CARD", "DEBIT_CARD"], description: "Payment type" },
                  },
                  required: ["type"],
                },
              },
              required: ["amount", "payment_method"],
            },
          },
        },
        required: ["order_id", "charges"],
      },
    },
    {
      name: "get_charge",
      description: "Get charge details by ID",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (CHAR_xxx)" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "list_charges",
      description: "List charges with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Filter by reference ID" },
          status: { type: "string", enum: ["AUTHORIZED", "PAID", "CANCELED", "DECLINED", "IN_ANALYSIS", "WAITING"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "capture_charge",
      description: "Capture a pre-authorized credit card charge",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (CHAR_xxx) in AUTHORIZED state" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Capture amount in cents (omit for full capture)" },
            },
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "cancel_charge",
      description: "Cancel a charge that has not yet been settled",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (CHAR_xxx)" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Cancel amount in cents (omit for full cancel)" },
            },
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto charge",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your reference ID" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Amount in cents (BRL)" },
              currency: { type: "string", description: "Currency (BRL)" },
            },
            required: ["value"],
          },
          payment_method: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["BOLETO"], description: "Must be BOLETO" },
              boleto: {
                type: "object",
                description: "Boleto-specific data (due_date, instruction_lines, holder)",
              },
            },
            required: ["type"],
          },
        },
        required: ["amount", "payment_method"],
      },
    },
    {
      name: "get_boleto",
      description: "Get boleto charge details by ID",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID of the boleto (CHAR_xxx)" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "get_public_keys",
      description: "Get PagSeguro public key for card data encryption (type: card)",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["card"], description: "Public key type (card)" },
        },
        required: ["type"],
      },
    },
    {
      name: "create_payout",
      description: "Create a payout/transfer to a bank account or Pix key",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your reference ID" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Amount in cents (BRL)" },
              currency: { type: "string", description: "Currency (BRL)" },
            },
            required: ["value"],
          },
          recipient: {
            type: "object",
            description: "Payout recipient (bank_account or pix_key)",
            properties: {
              name: { type: "string", description: "Recipient full name" },
              tax_id: { type: "string", description: "Recipient CPF or CNPJ (numbers only)" },
              bank_account: {
                type: "object",
                description: "Recipient bank account",
                properties: {
                  bank: { type: "string", description: "Bank code (ISPB or compe)" },
                  branch: { type: "string", description: "Branch number" },
                  number: { type: "string", description: "Account number" },
                  check_digit: { type: "string", description: "Account check digit" },
                  type: { type: "string", enum: ["CHECKING", "SAVINGS"], description: "Account type" },
                },
              },
              pix_key: { type: "string", description: "Pix key (optional alternative to bank_account)" },
            },
            required: ["name", "tax_id"],
          },
        },
        required: ["amount", "recipient"],
      },
    },
    {
      name: "create_webhook",
      description: "Register an application webhook URL to receive event notifications",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS URL that will receive webhook events" },
          events: {
            type: "array",
            description: "Event types to subscribe to (e.g. CHARGE.PAID, ORDER.CREATED)",
            items: { type: "string" },
          },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered application webhooks",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/orders", args), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/orders/${args?.id}`), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.reference_id) params.set("reference_id", String(args.reference_id));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/charges", args), null, 2) }] };
      case "refund": {
        const { charge_id, ...refundBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/charges/${charge_id}/cancel`, refundBody), null, 2) }] };
      }
      case "get_pix_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/charges/${args?.charge_id}/qrcodes`), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/customers", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", "/balance"), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/subscriptions", args), null, 2) }] };
      case "list_subscriptions": {
        const params = new URLSearchParams();
        if (args?.reference_id) params.set("reference_id", String(args.reference_id));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/subscriptions?${params}`), null, 2) }] };
      }
      case "get_notifications":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/notifications/${args?.notificationCode}`), null, 2) }] };
      case "create_split":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/charges/${args?.charge_id}/splits`, { receivers: args?.receivers }), null, 2) }] };
      case "get_dispute":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/disputes/${args?.dispute_id}`), null, 2) }] };
      case "pay_order": {
        const { order_id, ...payBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/orders/${order_id}/pay`, payBody), null, 2) }] };
      }
      case "get_charge":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/charges/${args?.charge_id}`), null, 2) }] };
      case "list_charges": {
        const params = new URLSearchParams();
        if (args?.reference_id) params.set("reference_id", String(args.reference_id));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/charges?${params}`), null, 2) }] };
      }
      case "capture_charge": {
        const { charge_id, ...captureBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/charges/${charge_id}/capture`, captureBody), null, 2) }] };
      }
      case "cancel_charge": {
        const { charge_id, ...cancelBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/charges/${charge_id}/cancel`, cancelBody), null, 2) }] };
      }
      case "create_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/charges", args), null, 2) }] };
      case "get_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/charges/${args?.charge_id}`), null, 2) }] };
      case "get_public_keys":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/public-keys", { type: args?.type }), null, 2) }] };
      case "create_payout":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/payouts", args), null, 2) }] };
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/applications/webhooks", args), null, 2) }] };
      case "list_webhooks": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/applications/webhooks?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-pagseguro", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
