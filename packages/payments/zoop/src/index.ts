#!/usr/bin/env node

/**
 * MCP Server for Zoop — Brazilian marketplace payment platform.
 *
 * Tools:
 * - create_transaction: Create a transaction (Pix, boleto, or credit card)
 * - get_transaction: Get transaction details by ID
 * - list_transactions: List transactions with filters
 * - create_split_rule: Create a split rule for a transaction
 * - create_seller: Create a seller in the marketplace
 * - get_seller: Get seller details by ID
 * - list_sellers: List sellers with filters
 * - create_buyer: Create a buyer
 * - get_balance: Get seller or marketplace balance
 * - create_transfer: Create a transfer to a seller's bank account
 * - refund_transaction: Refund a transaction (full or partial)
 * - get_receivables: Get receivables for a transaction
 * - create_token_card: Tokenize a credit card
 * - create_bank_account: Create a bank account token for a seller
 * - get_seller_balance: Get detailed balance for a specific seller
 * - update_seller: Update seller information
 * - list_transfers: List marketplace transfers with filters
 * - get_transfer: Get transfer details
 * - create_subscription: Create a recurring subscription
 * - list_receivables: List all receivables for the marketplace
 *
 * Environment:
 *   ZOOP_API_KEY — API key from https://docs.zoop.co/
 *   ZOOP_MARKETPLACE_ID — Marketplace ID
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.ZOOP_API_KEY || "";
const MARKETPLACE_ID = process.env.ZOOP_MARKETPLACE_ID || "";
const BASE_URL = `https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}`;

async function zoopRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const credentials = btoa(`${API_KEY}:`);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoop API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-zoop", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_transaction",
      description: "Create a transaction in Zoop (Pix, boleto, or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          on_behalf_of: { type: "string", description: "Seller ID to receive the payment" },
          amount: { type: "number", description: "Amount in cents (BRL)" },
          currency: { type: "string", description: "Currency code (BRL)", default: "BRL" },
          payment_type: { type: "string", enum: ["credit", "debit", "boleto", "pix"], description: "Payment type" },
          description: { type: "string", description: "Transaction description" },
          customer: { type: "string", description: "Buyer ID" },
          token: { type: "string", description: "Card token (for credit/debit)" },
          installment_plan: {
            type: "object",
            description: "Installment configuration",
            properties: {
              mode: { type: "string", enum: ["interest_free", "with_interest"], description: "Installment mode" },
              number_installments: { type: "number", description: "Number of installments" },
            },
          },
          payment_method: {
            type: "object",
            description: "Payment method details (for boleto/pix)",
            properties: {
              expiration_date: { type: "string", description: "Expiration date (YYYY-MM-DD)" },
              body_instructions: { type: "string", description: "Instructions on boleto body" },
            },
          },
        },
        required: ["on_behalf_of", "amount", "payment_type"],
      },
    },
    {
      name: "get_transaction",
      description: "Get transaction details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["succeeded", "failed", "pending", "canceled", "pre_authorized", "reversed", "refunded", "dispute"], description: "Filter by status" },
          payment_type: { type: "string", enum: ["credit", "debit", "boleto", "pix"], description: "Filter by payment type" },
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
          date_range_start: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_range_end: { type: "string", description: "End date (YYYY-MM-DD)" },
          sort: { type: "string", enum: ["time-descending", "time-ascending"], description: "Sort order" },
        },
      },
    },
    {
      name: "create_split_rule",
      description: "Create a split rule for distributing payments between sellers",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Transaction ID to split" },
          recipient: { type: "string", description: "Seller ID to receive the split" },
          percentage: { type: "number", description: "Split percentage (0-100)" },
          amount: { type: "number", description: "Fixed split amount in cents (alternative to percentage)" },
          liable: { type: "boolean", description: "Whether this recipient is liable for chargebacks" },
          charge_processing_fee: { type: "boolean", description: "Whether to charge processing fee to this recipient" },
        },
        required: ["transaction_id", "recipient"],
      },
    },
    {
      name: "create_seller",
      description: "Create a seller (individual or business) in the marketplace",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["individual", "business"], description: "Seller type" },
          first_name: { type: "string", description: "First name (individual)" },
          last_name: { type: "string", description: "Last name (individual)" },
          business_name: { type: "string", description: "Business name (business type)" },
          ein: { type: "string", description: "CNPJ (business) or CPF (individual)" },
          email: { type: "string", description: "Email address" },
          phone_number: { type: "string", description: "Phone number" },
          birthdate: { type: "string", description: "Birth date (YYYY-MM-DD, individual)" },
          address: {
            type: "object",
            description: "Seller address",
            properties: {
              line1: { type: "string", description: "Street address" },
              line2: { type: "string", description: "Complement" },
              neighborhood: { type: "string", description: "Neighborhood" },
              city: { type: "string", description: "City" },
              state: { type: "string", description: "State (UF, 2 letters)" },
              postal_code: { type: "string", description: "ZIP code (CEP)" },
              country_code: { type: "string", description: "Country code (BR)" },
            },
          },
        },
        required: ["type", "ein", "email"],
      },
    },
    {
      name: "get_seller",
      description: "Get seller details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Seller ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_sellers",
      description: "List sellers in the marketplace",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "pending", "disabled"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
          offset: { type: "number", description: "Pagination offset" },
          sort: { type: "string", enum: ["time-descending", "time-ascending"], description: "Sort order" },
        },
      },
    },
    {
      name: "create_buyer",
      description: "Create a buyer in the marketplace",
      inputSchema: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "First name" },
          last_name: { type: "string", description: "Last name" },
          email: { type: "string", description: "Email address" },
          taxpayer_id: { type: "string", description: "CPF (numbers only)" },
          phone_number: { type: "string", description: "Phone number" },
          birthdate: { type: "string", description: "Birth date (YYYY-MM-DD)" },
          address: {
            type: "object",
            description: "Buyer address",
            properties: {
              line1: { type: "string", description: "Street address" },
              line2: { type: "string", description: "Complement" },
              neighborhood: { type: "string", description: "Neighborhood" },
              city: { type: "string", description: "City" },
              state: { type: "string", description: "State (UF, 2 letters)" },
              postal_code: { type: "string", description: "ZIP code (CEP)" },
              country_code: { type: "string", description: "Country code (BR)" },
            },
          },
        },
        required: ["first_name", "last_name", "email"],
      },
    },
    {
      name: "get_balance",
      description: "Get balance for a seller or the marketplace",
      inputSchema: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "Seller ID (omit for marketplace balance)" },
        },
      },
    },
    {
      name: "create_transfer",
      description: "Create a transfer to a seller's bank account",
      inputSchema: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "Seller ID" },
          amount: { type: "number", description: "Amount in cents (BRL)" },
          description: { type: "string", description: "Transfer description" },
          transfer_type: { type: "string", enum: ["pix", "ted"], description: "Transfer method (default: pix)" },
        },
        required: ["seller_id", "amount"],
      },
    },
    {
      name: "refund_transaction",
      description: "Refund a transaction (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction ID to refund" },
          amount: { type: "number", description: "Amount in cents for partial refund (omit for full refund)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_receivables",
      description: "Get receivables for a transaction",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_token_card",
      description: "Tokenize a credit card for secure payments",
      inputSchema: {
        type: "object",
        properties: {
          holder_name: { type: "string", description: "Cardholder name" },
          card_number: { type: "string", description: "Card number" },
          expiration_month: { type: "string", description: "Expiration month (MM)" },
          expiration_year: { type: "string", description: "Expiration year (YYYY)" },
          security_code: { type: "string", description: "CVV/CVC security code" },
        },
        required: ["holder_name", "card_number", "expiration_month", "expiration_year", "security_code"],
      },
    },
    {
      name: "create_bank_account",
      description: "Create a bank account token for a seller",
      inputSchema: {
        type: "object",
        properties: {
          holder_name: { type: "string", description: "Account holder name" },
          bank_code: { type: "string", description: "Bank code (e.g. 001 for Banco do Brasil)" },
          routing_number: { type: "string", description: "Branch number (agência)" },
          account_number: { type: "string", description: "Account number with digit" },
          type: { type: "string", enum: ["checking", "savings"], description: "Account type" },
        },
        required: ["holder_name", "bank_code", "routing_number", "account_number", "type"],
      },
    },
    {
      name: "get_seller_balance",
      description: "Get detailed balance for a specific seller",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Seller ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_seller",
      description: "Update seller information",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Seller ID" },
          first_name: { type: "string", description: "First name" },
          last_name: { type: "string", description: "Last name" },
          email: { type: "string", description: "Email address" },
          phone_number: { type: "string", description: "Phone number" },
          business_name: { type: "string", description: "Business name (business type)" },
          address: {
            type: "object",
            description: "Updated address",
            properties: {
              line1: { type: "string" },
              line2: { type: "string" },
              neighborhood: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              postal_code: { type: "string" },
              country_code: { type: "string" },
            },
          },
        },
        required: ["id"],
      },
    },
    {
      name: "list_transfers",
      description: "List marketplace transfers with filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "succeeded", "failed"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
          offset: { type: "number", description: "Pagination offset" },
          sort: { type: "string", enum: ["time-descending", "time-ascending"], description: "Sort order" },
        },
      },
    },
    {
      name: "get_transfer",
      description: "Get transfer details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transfer ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Subscription plan ID" },
          customer_id: { type: "string", description: "Customer/buyer ID" },
          payment_method: { type: "string", description: "Payment method token or ID" },
        },
        required: ["plan_id", "customer_id", "payment_method"],
      },
    },
    {
      name: "list_receivables",
      description: "List all receivables for the marketplace",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "paid"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
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
      case "create_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", "/transactions", args), null, 2) }] };
      case "get_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/transactions/${args?.id}`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.payment_type) params.set("payment_type", String(args.payment_type));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        if (args?.date_range_start) params.set("date_range[gte]", String(args.date_range_start));
        if (args?.date_range_end) params.set("date_range[lte]", String(args.date_range_end));
        if (args?.sort) params.set("sort", String(args.sort));
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/transactions?${params}`), null, 2) }] };
      }
      case "create_split_rule": {
        const { transaction_id, ...splitBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", `/transactions/${transaction_id}/split_rules`, splitBody), null, 2) }] };
      }
      case "create_seller": {
        const sellerType = (args as Record<string, unknown>)?.type;
        const endpoint = sellerType === "business" ? "/sellers/businesses" : "/sellers/individuals";
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", endpoint, args), null, 2) }] };
      }
      case "get_seller":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/sellers/${args?.id}`), null, 2) }] };
      case "list_sellers": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        if (args?.sort) params.set("sort", String(args.sort));
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/sellers?${params}`), null, 2) }] };
      }
      case "create_buyer":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", "/buyers", args), null, 2) }] };
      case "get_balance": {
        if (args?.seller_id) {
          return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/sellers/${args.seller_id}/balances`), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", "/balances"), null, 2) }] };
      }
      case "create_transfer": {
        const { seller_id, ...transferBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", `/sellers/${seller_id}/transfers`, transferBody), null, 2) }] };
      }
      case "refund_transaction": {
        const body = args?.amount ? { amount: args.amount } : undefined;
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", `/transactions/${args?.id}/refund`, body), null, 2) }] };
      }
      case "get_receivables":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/transactions/${args?.id}/receivables`), null, 2) }] };
      case "create_token_card":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", "/cards/tokens", args), null, 2) }] };
      case "create_bank_account":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", "/bank_accounts", args), null, 2) }] };
      case "get_seller_balance":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/sellers/${args?.id}/balances`), null, 2) }] };
      case "update_seller": {
        const { id, ...updateBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("PUT", `/sellers/${id}`, updateBody), null, 2) }] };
      }
      case "list_transfers": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        if (args?.sort) params.set("sort", String(args.sort));
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/transfers?${params}`), null, 2) }] };
      }
      case "get_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/transfers/${args?.id}`), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("POST", "/subscriptions", args), null, 2) }] };
      case "list_receivables": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await zoopRequest("GET", `/receivables?${params}`), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_KEY) {
    console.error("ZOOP_API_KEY environment variable is required");
    process.exit(1);
  }
  if (!MARKETPLACE_ID) {
    console.error("ZOOP_MARKETPLACE_ID environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
