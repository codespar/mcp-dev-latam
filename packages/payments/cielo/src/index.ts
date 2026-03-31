#!/usr/bin/env node

/**
 * MCP Server for Cielo — Brazilian payment gateway (credit card, debit, boleto, recurrent).
 *
 * Tools:
 * - create_sale: Create a credit/debit card sale
 * - get_sale: Get sale details by PaymentId
 * - capture_sale: Capture a pre-authorized sale
 * - cancel_sale: Cancel/void a sale
 * - create_recurrent: Create a recurrent payment
 * - get_recurrent: Get recurrent payment details
 * - tokenize_card: Tokenize a credit card for future use
 * - create_boleto: Create a boleto payment
 *
 * Environment:
 *   CIELO_MERCHANT_ID — MerchantId from Cielo
 *   CIELO_MERCHANT_KEY — MerchantKey from Cielo
 *   CIELO_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MERCHANT_ID = process.env.CIELO_MERCHANT_ID || "";
const MERCHANT_KEY = process.env.CIELO_MERCHANT_KEY || "";
const BASE_URL = process.env.CIELO_SANDBOX === "true"
  ? "https://apisandbox.cieloecommerce.cielo.com.br/1"
  : "https://api.cieloecommerce.cielo.com.br/1";
const QUERY_URL = process.env.CIELO_SANDBOX === "true"
  ? "https://apiquerysandbox.cieloecommerce.cielo.com.br/1"
  : "https://apiquery.cieloecommerce.cielo.com.br/1";

async function cieloRequest(method: string, path: string, body?: unknown, useQueryUrl = false): Promise<unknown> {
  const baseUrl = useQueryUrl ? QUERY_URL : BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "MerchantId": MERCHANT_ID,
      "MerchantKey": MERCHANT_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cielo API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-cielo", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_sale",
      description: "Create a credit/debit card sale in Cielo",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents (e.g., 15700 = R$157.00)" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", enum: ["Visa", "Master", "Elo", "Amex", "Hipercard"], description: "Card brand" },
          installments: { type: "number", description: "Number of installments (1 for full payment)" },
          capture: { type: "boolean", description: "Auto-capture (true for immediate capture)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand"],
      },
    },
    {
      name: "get_sale",
      description: "Get sale details by PaymentId",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "capture_sale",
      description: "Capture a pre-authorized sale",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
          amount: { type: "number", description: "Amount to capture in cents (optional, defaults to full amount)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "cancel_sale",
      description: "Cancel/void a sale (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
          amount: { type: "number", description: "Amount to cancel in cents (optional, defaults to full amount)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_recurrent",
      description: "Create a recurrent (recurring) credit card payment",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", description: "Card brand" },
          interval: { type: "string", enum: ["Monthly", "Bimonthly", "Quarterly", "SemiAnnual", "Annual"], description: "Recurrence interval" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD, optional)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand", "interval"],
      },
    },
    {
      name: "get_recurrent",
      description: "Get recurrent payment details",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
        },
        required: ["recurrentPaymentId"],
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a credit card for future use",
      inputSchema: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Customer name" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          brand: { type: "string", description: "Card brand" },
        },
        required: ["customerName", "cardNumber", "holder", "expirationDate", "brand"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto payment in Cielo",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          customerIdentity: { type: "string", description: "CPF or CNPJ" },
          amount: { type: "number", description: "Amount in cents" },
          expirationDate: { type: "string", description: "Boleto expiration date (YYYY-MM-DD)" },
          instructions: { type: "string", description: "Boleto instructions text" },
          provider: { type: "string", enum: ["Bradesco2", "BancoDoBrasil2", "ItauShopline", "Santander2", "Caixa2"], description: "Boleto provider/bank" },
        },
        required: ["merchantOrderId", "customerName", "amount", "expirationDate", "provider"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_sale": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: args?.installments || 1,
            Capture: args?.capture ?? false,
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_sale":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/sales/${args?.paymentId}`, undefined, true), null, 2) }] };
      case "capture_sale": {
        const capturePath = args?.amount
          ? `/sales/${args.paymentId}/capture?amount=${args.amount}`
          : `/sales/${args?.paymentId}/capture`;
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", capturePath), null, 2) }] };
      }
      case "cancel_sale": {
        const cancelPath = args?.amount
          ? `/sales/${args.paymentId}/void?amount=${args.amount}`
          : `/sales/${args?.paymentId}/void`;
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", cancelPath), null, 2) }] };
      }
      case "create_recurrent": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: 1,
            RecurrentPayment: {
              AuthorizeNow: true,
              Interval: args?.interval,
              EndDate: args?.endDate,
            },
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_recurrent":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/RecurrentPayment/${args?.recurrentPaymentId}`, undefined, true), null, 2) }] };
      case "tokenize_card": {
        const payload = {
          MerchantOrderId: "tokenize",
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: 0,
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              Brand: args?.brand,
              SaveCard: true,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "create_boleto": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: {
            Name: args?.customerName,
            Identity: args?.customerIdentity,
          },
          Payment: {
            Type: "Boleto",
            Amount: args?.amount,
            Provider: args?.provider,
            ExpirationDate: args?.expirationDate,
            Instructions: args?.instructions,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!MERCHANT_ID || !MERCHANT_KEY) {
    console.error("CIELO_MERCHANT_ID and CIELO_MERCHANT_KEY environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
