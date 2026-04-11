#!/usr/bin/env node

/**
 * MCP Server for SuperFrete — Brazilian shipping and logistics platform.
 *
 * Tools:
 * - calculate_freight: Calculate shipping rates across carriers (PAC, SEDEX, JadLog, Loggi, Mini Envios)
 * - create_freight: Create a freight/label order
 * - get_freight: Get freight order details by ID
 * - checkout_freight: Purchase/checkout freight orders
 * - cancel_freight: Cancel a freight order
 * - get_user_info: Get authenticated user info and balance
 * - get_user_addresses: List user's saved addresses
 * - get_services: Get available services with restrictions and limits
 * - list_webhooks: List all configured webhooks
 * - create_webhook: Create a new webhook
 * - delete_webhook: Delete a webhook
 *
 * Environment:
 *   SUPERFRETE_TOKEN — API Bearer token from https://superfrete.com/
 *   SUPERFRETE_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.SUPERFRETE_TOKEN || "";
const BASE_URL = process.env.SUPERFRETE_SANDBOX === "true"
  ? "https://sandbox.superfrete.com/"
  : "https://api.superfrete.com/";

async function superfreteRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
      "User-Agent": "mcp-superfrete/0.1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SuperFrete API ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { success: true };
}

const server = new Server(
  { name: "mcp-superfrete", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions: `You are connected to the SuperFrete shipping API — a Brazilian logistics platform that offers discounted rates across multiple carriers.

## Workflow
The typical freight flow is: calculate_freight → create_freight → checkout_freight.
- calculate_freight: get prices and delivery times for available carriers
- create_freight: create the order with full addresses and product details
- checkout_freight: pay for the order — this generates the shipping label and tracking code
- get_freight: retrieve order details, tracking, and label print URL

## Services
Available carrier services (use these IDs):
- 1 = PAC (Correios, economy)
- 2 = SEDEX (Correios, express)
- 3 = JadLog (.Package)
- 17 = Mini Envios (Correios, small items up to 300g)
- 31 = Loggi

## Important Rules
- ALWAYS ask the user for package dimensions (width, height, length), weight, and quantity before calling calculate_freight. Never guess these values.
- ALWAYS ask the user for the product unitary_value before calling create_freight. The API requires it to be greater than zero.
- For commercial shipments (non_commercial=false), an invoice number is required. Ask the user.
- For non-commercial shipments, still ask for the product value — it's used in the content declaration.
- The API enforces minimum dimensions per service (e.g. PAC/SEDEX: min width 16cm, min length 24cm, min height 4cm). The API will auto-adjust if needed.
- checkout_freight charges the user's account balance. Always confirm with the user before calling it.
- Postal codes (CEP) should be 8 digits, numbers only.
- Addresses require: name, address (street), district, city, state_abbr (2-letter UF), and postal_code at minimum.

## Authentication
If the user needs an API key, direct them to: https://web.superfrete.com/#/integrations/select-integration-platform — they should click the "Desenvolvedores" option and then "Integrar" to generate their API token.`,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "calculate_freight",
      description: "Calculate shipping rates across multiple carriers (PAC, SEDEX, JadLog, Loggi, Mini Envios). Returns pricing, delivery time, and carrier details for each available service.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "object",
            description: "Origin address",
            properties: { postal_code: { type: "string", description: "Origin CEP (e.g. '01001000')" } },
            required: ["postal_code"],
          },
          to: {
            type: "object",
            description: "Destination address",
            properties: { postal_code: { type: "string", description: "Destination CEP (e.g. '20040020')" } },
            required: ["postal_code"],
          },
          services: {
            type: "string",
            description: "Comma-separated service IDs to quote. 1=PAC, 2=SEDEX, 3=JadLog, 17=Mini Envios, 31=Loggi. Leave empty for all.",
          },
          products: {
            type: "array",
            description: "Package dimensions and weight",
            items: {
              type: "object",
              properties: {
                width: { type: "number", description: "Width in cm" },
                height: { type: "number", description: "Height in cm" },
                length: { type: "number", description: "Length in cm" },
                weight: { type: "number", description: "Weight in kg" },
                quantity: { type: "number", description: "Quantity" },
              },
              required: ["width", "height", "length", "weight", "quantity"],
            },
          },
          options: {
            type: "object",
            description: "Shipping options",
            properties: {
              insurance_value: { type: "number", description: "Declared value for insurance (in BRL)" },
              receipt: { type: "boolean", description: "Request delivery receipt (default: false)" },
              own_hand: { type: "boolean", description: "Deliver to recipient only (default: false)" },
            },
          },
        },
        required: ["from", "to", "products"],
      },
    },
    {
      name: "create_freight",
      description: "Create a freight/label order. Returns the order ID, price, protocol, and tracking code. For commercial shipments, invoice details are required.",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "number",
            description: "Service ID from calculate_freight (1=PAC, 2=SEDEX, 3=JadLog, 17=Mini Envios, 31=Loggi)",
          },
          from: {
            type: "object",
            description: "Sender address",
            properties: {
              name: { type: "string", description: "Sender name" },
              address: { type: "string", description: "Street address" },
              number: { type: "string", description: "Street number" },
              complement: { type: "string", description: "Address complement" },
              district: { type: "string", description: "Neighborhood/district" },
              city: { type: "string", description: "City" },
              state_abbr: { type: "string", description: "State abbreviation (e.g. SP)" },
              postal_code: { type: "string", description: "CEP" },
              document: { type: "string", description: "CPF or CNPJ" },
            },
            required: ["name", "address", "district", "city", "state_abbr", "postal_code"],
          },
          to: {
            type: "object",
            description: "Recipient address",
            properties: {
              name: { type: "string", description: "Recipient name" },
              address: { type: "string", description: "Street address" },
              number: { type: "string", description: "Street number" },
              complement: { type: "string", description: "Address complement" },
              district: { type: "string", description: "Neighborhood/district" },
              city: { type: "string", description: "City" },
              state_abbr: { type: "string", description: "State abbreviation (e.g. SP)" },
              postal_code: { type: "string", description: "CEP" },
              document: { type: "string", description: "CPF or CNPJ" },
              email: { type: "string", description: "Recipient email" },
            },
            required: ["name", "address", "district", "city", "state_abbr", "postal_code"],
          },
          products: {
            type: "array",
            description: "Products being shipped",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Product name" },
                quantity: { type: "string", description: "Quantity" },
                unitary_value: { type: "string", description: "Unit value in BRL (must be greater than zero)" },
              },
              required: ["name", "quantity", "unitary_value"],
            },
          },
          volumes: {
            type: "object",
            description: "Package dimensions",
            properties: {
              width: { type: "number", description: "Width in cm" },
              height: { type: "number", description: "Height in cm" },
              length: { type: "number", description: "Length in cm" },
              weight: { type: "number", description: "Weight in kg" },
            },
            required: ["width", "height", "length", "weight"],
          },
          options: {
            type: "object",
            description: "Shipping options",
            properties: {
              insurance_value: { type: "number", description: "Declared value for insurance (in BRL)" },
              receipt: { type: "boolean", description: "Request delivery receipt" },
              own_hand: { type: "boolean", description: "Deliver to recipient only" },
              non_commercial: { type: "boolean", description: "Non-commercial shipment (default: false). If false, invoice is required." },
              invoice: {
                type: "object",
                description: "Invoice details (required for commercial shipments)",
                properties: {
                  number: { type: "string", description: "Invoice number" },
                  key: { type: "string", description: "Invoice access key (chave de acesso NF-e)" },
                },
                required: ["number"],
              },
              tags: {
                type: "array",
                description: "Tags for the order",
                items: {
                  type: "object",
                  properties: {
                    tag: { type: "string" },
                    url: { type: "string" },
                  },
                },
              },
            },
          },
        },
        required: ["service", "from", "to", "products", "volumes"],
      },
    },
    {
      name: "get_freight",
      description: "Get detailed information about a freight order including status, tracking, addresses, pricing, and label print URL.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Freight order ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "checkout_freight",
      description: "Purchase/checkout freight orders. Pays for the orders and generates shipping labels. Returns tracking numbers and label print URLs.",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to purchase",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "cancel_freight",
      description: "Cancel a freight order. Provide the order ID and a reason for cancellation.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID to cancel" },
          description: { type: "string", description: "Reason for cancellation" },
        },
        required: ["id", "description"],
      },
    },
    {
      name: "get_user_info",
      description: "Get authenticated user information including name, email, document (CPF/CNPJ), account balance, and shipment limits.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_user_addresses",
      description: "List all saved addresses for the authenticated user.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_services",
      description: "Get available shipping services with detailed restrictions (min/max weight, dimensions) and carrier information.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_webhooks",
      description: "List all configured webhooks for the account.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_webhook",
      description: "Create a new webhook to receive notifications about order events.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Webhook name" },
          url: { type: "string", description: "Webhook callback URL" },
          events: {
            type: "array",
            items: { type: "string" },
            description: "Events to subscribe to (e.g. 'order.created', 'order.updated')",
          },
        },
        required: ["name", "url", "events"],
      },
    },
    {
      name: "delete_webhook",
      description: "Delete a webhook by ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Webhook ID to delete" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "calculate_freight": {
        const body: Record<string, unknown> = {
          from: args?.from,
          to: args?.to,
          products: args?.products,
          services: args?.services || "1,2,3,17,31",
          options: args?.options || { insurance_value: null, receipt: false, own_hand: false },
        };
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("POST", "api/v0/calculator", body), null, 2) }] };
      }
      case "create_freight": {
        const opts = typeof args?.options === "string" ? JSON.parse(args.options) : args?.options;
        const vols = typeof args?.volumes === "string" ? JSON.parse(args.volumes) : args?.volumes;
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("POST", "api/v0/cart", {
          from: args?.from,
          to: args?.to,
          products: args?.products,
          service: args?.service,
          volumes: vols,
          options: opts || { insurance_value: null, receipt: false, own_hand: false, non_commercial: true, tags: [] },
        }), null, 2) }] };
      }
      case "get_freight":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("GET", `api/v0/order/info/${args?.id}`), null, 2) }] };
      case "checkout_freight":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("POST", "api/v0/checkout", { orders: args?.orders }), null, 2) }] };
      case "cancel_freight":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("POST", "api/v0/order/cancel", {
          order: { id: args?.id, description: args?.description },
        }), null, 2) }] };
      case "get_user_info":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("GET", "api/v0/user"), null, 2) }] };
      case "get_user_addresses":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("GET", "api/v0/user/addresses"), null, 2) }] };
      case "get_services":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("GET", "api/v0/services/info/"), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("GET", "api/v0/webhook"), null, 2) }] };
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("POST", "api/v0/webhook", {
          name: args?.name,
          url: args?.url,
          events: args?.events,
        }), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await superfreteRequest("DELETE", `api/v0/webhook/${args?.id}`), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!TOKEN) {
    console.error("SUPERFRETE_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
