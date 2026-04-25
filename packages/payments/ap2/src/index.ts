#!/usr/bin/env node

/**
 * MCP Server for AP2 — Google's Agent-to-Agent Payment Protocol.
 *
 * AP2 provides authorization, audit trails, and trust frameworks
 * for AI agents making payments. It defines who authorized a payment,
 * what limits apply, and maintains a complete audit trail.
 *
 * Tools:
 * - register_agent: Register an AI agent as a trusted payer in AP2
 * - get_agent: Get agent registration details and trust status
 * - list_agents: List registered agents with filters
 * - revoke_agent: Revoke an agent's payment authorization
 * - authorize_payment: Request payment authorization with scoped limits
 * - get_authorization: Get authorization details by ID
 * - list_authorizations: List payment authorizations with filters
 * - execute_payment: Execute an authorized payment
 * - get_audit_trail: Get full audit trail for a transaction
 * - list_audit_events: List audit events with filters
 * - list_payment_methods: List available payment methods via AP2 partners
 * - get_transaction: Get transaction details
 * - list_transactions: List transactions with filters
 * - create_intent_mandate: Create a Verifiable Credential intent mandate (user → agent intent to transact)
 * - create_cart_mandate: Create a cart mandate (signed, locked-cart commitment)
 * - create_payment_mandate: Create a payment mandate (final payment authorization VC)
 * - verify_credential: Verify a Verifiable Credential (intent / cart / payment mandate)
 * - create_presentation: Create a Verifiable Presentation bundling one or more credentials
 * - verify_presentation: Verify a Verifiable Presentation and its embedded credentials
 * - resolve_did: Resolve a Decentralized Identifier (DID) to its DID document
 * - create_receipt: Create a signed receipt for a settled payment
 * - verify_receipt: Verify a receipt's signature and integrity
 *
 * Environment:
 *   AP2_API_KEY    — API key for AP2 platform
 *   AP2_AGENT_ID   — Registered agent ID
 *   AP2_SANDBOX    — Set to "true" for sandbox mode
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.AP2_API_KEY || "";
const AGENT_ID = process.env.AP2_AGENT_ID || "";
const SANDBOX = process.env.AP2_SANDBOX === "true";
const BASE_URL = SANDBOX
  ? "https://sandbox.ap2.googleapis.com/v1"
  : "https://ap2.googleapis.com/v1";

async function ap2Request(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "X-Agent-Id": AGENT_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AP2 API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-ap2", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "register_agent",
      description: "Register an AI agent as a trusted payer in the AP2 network. Defines the agent's identity, capabilities, and spending limits.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Human-readable agent name" },
          description: { type: "string", description: "Agent description and purpose" },
          capabilities: {
            type: "array",
            items: { type: "string", enum: ["pay", "receive", "authorize", "audit"] },
            description: "Agent capabilities",
          },
          spendLimit: {
            type: "object",
            properties: {
              amount: { type: "string", description: "Maximum spend amount (e.g. '1000.00')" },
              currency: { type: "string", description: "Currency code (e.g. 'USD')" },
              period: { type: "string", enum: ["per_transaction", "daily", "weekly", "monthly"], description: "Limit period" },
            },
            required: ["amount", "currency", "period"],
            description: "Spending limit for this agent",
          },
          ownerEmail: { type: "string", description: "Owner email for notifications" },
        },
        required: ["name", "capabilities", "spendLimit"],
      },
    },
    {
      name: "get_agent",
      description: "Get agent registration details, trust status, and current spend usage",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID (defaults to current agent)" },
        },
      },
    },
    {
      name: "list_agents",
      description: "List registered agents with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "suspended", "revoked"], description: "Filter by status" },
          capability: { type: "string", enum: ["pay", "receive", "authorize", "audit"], description: "Filter by capability" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
    {
      name: "revoke_agent",
      description: "Revoke an agent's payment authorization. The agent will no longer be able to make or receive payments.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID to revoke" },
          reason: { type: "string", description: "Reason for revocation" },
        },
        required: ["agentId", "reason"],
      },
    },
    {
      name: "authorize_payment",
      description: "Request payment authorization with scoped limits. Returns an authorization token that can be used to execute the payment.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Payment amount (e.g. '25.00')" },
          currency: { type: "string", description: "Currency code (e.g. 'USD')" },
          recipientAgentId: { type: "string", description: "Recipient agent ID" },
          purpose: { type: "string", description: "Payment purpose / description" },
          paymentMethod: { type: "string", enum: ["card", "bank_transfer", "wallet", "x402"], description: "Preferred payment method" },
          expiresIn: { type: "number", description: "Authorization validity in seconds (default: 3600)" },
          metadata: { type: "object", description: "Custom metadata key-value pairs" },
        },
        required: ["amount", "currency", "recipientAgentId", "purpose"],
      },
    },
    {
      name: "get_authorization",
      description: "Get authorization details including status, limits, and expiry",
      inputSchema: {
        type: "object",
        properties: {
          authorizationId: { type: "string", description: "Authorization ID" },
        },
        required: ["authorizationId"],
      },
    },
    {
      name: "list_authorizations",
      description: "List payment authorizations with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "denied", "expired", "used"], description: "Filter by status" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
    {
      name: "execute_payment",
      description: "Execute an authorized payment. Requires a valid authorization token.",
      inputSchema: {
        type: "object",
        properties: {
          authorizationId: { type: "string", description: "Authorization ID from authorize_payment" },
          paymentMethodId: { type: "string", description: "Specific payment method ID to use" },
        },
        required: ["authorizationId"],
      },
    },
    {
      name: "get_audit_trail",
      description: "Get the complete audit trail for a transaction — every authorization, approval, execution, and settlement event",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "list_audit_events",
      description: "List audit events across all transactions with filters",
      inputSchema: {
        type: "object",
        properties: {
          eventType: { type: "string", enum: ["authorization_requested", "authorization_approved", "authorization_denied", "payment_executed", "payment_settled", "payment_failed", "agent_registered", "agent_revoked"], description: "Filter by event type" },
          agentId: { type: "string", description: "Filter by agent ID" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
    {
      name: "list_payment_methods",
      description: "List available payment methods from AP2 partner network (Visa, Mastercard, Stripe, PayPal, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["card", "bank_transfer", "wallet", "x402"], description: "Filter by method type" },
          currency: { type: "string", description: "Filter by supported currency" },
        },
      },
    },
    {
      name: "get_transaction",
      description: "Get full transaction details including authorization, execution, and settlement status",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "authorized", "executed", "settled", "failed", "refunded"], description: "Filter by status" },
          direction: { type: "string", enum: ["sent", "received"], description: "Filter by direction" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          minAmount: { type: "string", description: "Minimum amount" },
          maxAmount: { type: "string", description: "Maximum amount" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
    {
      name: "create_intent_mandate",
      description: "Create an AP2 intent mandate — a Verifiable Credential expressing the user's intent to delegate a transaction to an agent (scope, constraints, expiry).",
      inputSchema: {
        type: "object",
        properties: {
          subjectDid: { type: "string", description: "DID of the user delegating intent" },
          agentDid: { type: "string", description: "DID of the agent receiving the intent" },
          scope: { type: "string", description: "Free-form scope (e.g. 'purchase running shoes under $200')" },
          maxAmount: { type: "string", description: "Maximum amount the agent can spend" },
          currency: { type: "string", description: "Currency code (e.g. 'USD')" },
          merchantAllowList: { type: "array", items: { type: "string" }, description: "Optional list of merchant DIDs/IDs the agent may transact with" },
          expiresAt: { type: "string", description: "Expiry timestamp (ISO 8601)" },
          metadata: { type: "object", description: "Custom metadata key-value pairs" },
        },
        required: ["subjectDid", "agentDid", "scope", "maxAmount", "currency"],
      },
    },
    {
      name: "create_cart_mandate",
      description: "Create an AP2 cart mandate — a signed, locked-cart commitment from a merchant binding line items, totals, and merchant attestation.",
      inputSchema: {
        type: "object",
        properties: {
          intentMandateId: { type: "string", description: "Linked intent mandate VC ID" },
          merchantDid: { type: "string", description: "DID of the merchant" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string", description: "Product SKU" },
                name: { type: "string", description: "Item name" },
                quantity: { type: "number", description: "Quantity" },
                unitPrice: { type: "string", description: "Unit price" },
              },
              required: ["name", "quantity", "unitPrice"],
            },
            description: "Cart line items",
          },
          total: { type: "string", description: "Cart total amount" },
          currency: { type: "string", description: "Currency code" },
          expiresAt: { type: "string", description: "Cart expiry (ISO 8601)" },
        },
        required: ["intentMandateId", "merchantDid", "items", "total", "currency"],
      },
    },
    {
      name: "create_payment_mandate",
      description: "Create an AP2 payment mandate — the final Verifiable Credential authorizing settlement against a cart mandate.",
      inputSchema: {
        type: "object",
        properties: {
          cartMandateId: { type: "string", description: "Linked cart mandate VC ID" },
          payerDid: { type: "string", description: "DID of the payer (typically the user)" },
          paymentMethodId: { type: "string", description: "Payment method ID to settle against" },
          amount: { type: "string", description: "Final payment amount" },
          currency: { type: "string", description: "Currency code" },
          metadata: { type: "object", description: "Custom metadata key-value pairs" },
        },
        required: ["cartMandateId", "payerDid", "amount", "currency"],
      },
    },
    {
      name: "verify_credential",
      description: "Verify a Verifiable Credential (intent, cart, or payment mandate). Checks signature, issuer trust, expiry, and revocation status.",
      inputSchema: {
        type: "object",
        properties: {
          credential: { type: "object", description: "The Verifiable Credential JSON-LD object to verify" },
          credentialId: { type: "string", description: "Alternatively, the ID of a stored credential to verify" },
        },
      },
    },
    {
      name: "create_presentation",
      description: "Create a Verifiable Presentation bundling one or more credentials (e.g. intent + cart + payment mandates) for a given audience/verifier.",
      inputSchema: {
        type: "object",
        properties: {
          holderDid: { type: "string", description: "DID of the presentation holder" },
          credentialIds: { type: "array", items: { type: "string" }, description: "IDs of credentials to include" },
          audience: { type: "string", description: "Intended verifier DID or URI" },
          challenge: { type: "string", description: "Optional challenge nonce supplied by the verifier" },
        },
        required: ["holderDid", "credentialIds", "audience"],
      },
    },
    {
      name: "verify_presentation",
      description: "Verify a Verifiable Presentation and all embedded credentials, including holder binding and challenge nonce.",
      inputSchema: {
        type: "object",
        properties: {
          presentation: { type: "object", description: "The Verifiable Presentation JSON-LD object" },
          challenge: { type: "string", description: "Expected challenge nonce, if used" },
          audience: { type: "string", description: "Expected audience (verifier DID)" },
        },
        required: ["presentation"],
      },
    },
    {
      name: "resolve_did",
      description: "Resolve a Decentralized Identifier (DID) to its DID document via the AP2 universal resolver.",
      inputSchema: {
        type: "object",
        properties: {
          did: { type: "string", description: "The DID to resolve (e.g. 'did:web:merchant.example')" },
        },
        required: ["did"],
      },
    },
    {
      name: "create_receipt",
      description: "Create a signed receipt for a settled payment — a tamper-evident record linking transaction, mandates, and settlement.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Settled transaction ID" },
          paymentMandateId: { type: "string", description: "Payment mandate VC ID" },
          notes: { type: "string", description: "Optional human-readable notes" },
          metadata: { type: "object", description: "Custom metadata key-value pairs" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "verify_receipt",
      description: "Verify a receipt's signature, issuer, and chain back to the originating mandates.",
      inputSchema: {
        type: "object",
        properties: {
          receiptId: { type: "string", description: "Receipt ID to verify" },
          receipt: { type: "object", description: "Alternatively, the receipt object itself" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "register_agent":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/agents", args), null, 2),
          }],
        };

      case "get_agent": {
        const id = args?.agentId || AGENT_ID;
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/agents/${id}`), null, 2),
          }],
        };
      }

      case "list_agents": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.capability) params.set("capability", String(args.capability));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/agents?${params}`), null, 2),
          }],
        };
      }

      case "revoke_agent":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", `/agents/${args?.agentId}/revoke`, { reason: args?.reason }), null, 2),
          }],
        };

      case "authorize_payment":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/authorizations", {
              agentId: AGENT_ID,
              amount: args?.amount,
              currency: args?.currency,
              recipientAgentId: args?.recipientAgentId,
              purpose: args?.purpose,
              paymentMethod: args?.paymentMethod,
              expiresIn: args?.expiresIn,
              metadata: args?.metadata,
            }), null, 2),
          }],
        };

      case "get_authorization":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/authorizations/${args?.authorizationId}`), null, 2),
          }],
        };

      case "list_authorizations": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/authorizations?${params}`), null, 2),
          }],
        };
      }

      case "execute_payment":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/payments", {
              authorizationId: args?.authorizationId,
              paymentMethodId: args?.paymentMethodId,
            }), null, 2),
          }],
        };

      case "get_audit_trail":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/transactions/${args?.transactionId}/audit`), null, 2),
          }],
        };

      case "list_audit_events": {
        const params = new URLSearchParams();
        if (args?.eventType) params.set("eventType", String(args.eventType));
        if (args?.agentId) params.set("agentId", String(args.agentId));
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/audit?${params}`), null, 2),
          }],
        };
      }

      case "list_payment_methods": {
        const params = new URLSearchParams();
        if (args?.type) params.set("type", String(args.type));
        if (args?.currency) params.set("currency", String(args.currency));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/payment-methods?${params}`), null, 2),
          }],
        };
      }

      case "get_transaction":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/transactions/${args?.transactionId}`), null, 2),
          }],
        };

      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.direction) params.set("direction", String(args.direction));
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        if (args?.minAmount) params.set("minAmount", String(args.minAmount));
        if (args?.maxAmount) params.set("maxAmount", String(args.maxAmount));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/transactions?${params}`), null, 2),
          }],
        };
      }

      case "create_intent_mandate":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/mandates/intent", {
              subjectDid: args?.subjectDid,
              agentDid: args?.agentDid,
              scope: args?.scope,
              maxAmount: args?.maxAmount,
              currency: args?.currency,
              merchantAllowList: args?.merchantAllowList,
              expiresAt: args?.expiresAt,
              metadata: args?.metadata,
            }), null, 2),
          }],
        };

      case "create_cart_mandate":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/mandates/cart", {
              intentMandateId: args?.intentMandateId,
              merchantDid: args?.merchantDid,
              items: args?.items,
              total: args?.total,
              currency: args?.currency,
              expiresAt: args?.expiresAt,
            }), null, 2),
          }],
        };

      case "create_payment_mandate":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/mandates/payment", {
              cartMandateId: args?.cartMandateId,
              payerDid: args?.payerDid,
              paymentMethodId: args?.paymentMethodId,
              amount: args?.amount,
              currency: args?.currency,
              metadata: args?.metadata,
            }), null, 2),
          }],
        };

      case "verify_credential":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/credentials/verify", {
              credential: args?.credential,
              credentialId: args?.credentialId,
            }), null, 2),
          }],
        };

      case "create_presentation":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/presentations", {
              holderDid: args?.holderDid,
              credentialIds: args?.credentialIds,
              audience: args?.audience,
              challenge: args?.challenge,
            }), null, 2),
          }],
        };

      case "verify_presentation":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/presentations/verify", {
              presentation: args?.presentation,
              challenge: args?.challenge,
              audience: args?.audience,
            }), null, 2),
          }],
        };

      case "resolve_did":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("GET", `/did/resolve/${encodeURIComponent(String(args?.did))}`), null, 2),
          }],
        };

      case "create_receipt":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/receipts", {
              transactionId: args?.transactionId,
              paymentMandateId: args?.paymentMandateId,
              notes: args?.notes,
              metadata: args?.metadata,
            }), null, 2),
          }],
        };

      case "verify_receipt":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await ap2Request("POST", "/receipts/verify", {
              receiptId: args?.receiptId,
              receipt: args?.receipt,
            }), null, 2),
          }],
        };

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
        const s = new Server({ name: "mcp-ap2", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
