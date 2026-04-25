#!/usr/bin/env node

/**
 * MCP Server for Belvo — Open Finance aggregator for LATAM
 * (Mexico, Argentina, Colombia).
 *
 * Tools:
 * - list_institutions: List available financial institutions
 * - create_link: Create a link to a financial institution
 * - list_links: List existing links
 * - get_link: Retrieve a specific link by ID
 * - delete_link: Delete a link by ID
 * - patch_link: Update link credentials (e.g. recover from INVALID)
 * - get_accounts: Get accounts for a link
 * - list_accounts: List stored accounts (GET /api/accounts/)
 * - get_account_detail: Retrieve a stored account by ID
 * - list_transactions: List stored transactions (GET /api/transactions/)
 * - get_transaction_detail: Retrieve a stored transaction by ID
 * - get_balances: Get balances for a link
 * - list_balances: List stored balances (GET /api/balances/)
 * - get_owners: Get owner information for a link
 * - list_owners: List stored owners
 * - get_incomes: Get income data for a link
 * - list_incomes: List stored incomes
 * - get_employment_records: Get employment records for a link
 * - get_invoices: Get invoices (BR/MX fiscal institutions)
 * - get_receivables_transactions: Get receivables (payment rails)
 * - get_tax_returns: Get tax returns for a link
 * - get_investments: Get investment portfolios for a link
 * - create_widget_token: Create an access token for Belvo Connect Widget
 *
 * Environment:
 *   BELVO_SECRET_ID — Secret ID for authentication
 *   BELVO_SECRET_PASSWORD — Secret password for authentication
 *   BELVO_SANDBOX — Set to "true" to use sandbox environment
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SECRET_ID = process.env.BELVO_SECRET_ID || "";
const SECRET_PASSWORD = process.env.BELVO_SECRET_PASSWORD || "";
const IS_SANDBOX = process.env.BELVO_SANDBOX === "true";
const BASE_URL = IS_SANDBOX ? "https://sandbox.belvo.com" : "https://api.belvo.com";

async function belvoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET_ID && SECRET_PASSWORD) {
    headers["Authorization"] = `Basic ${Buffer.from(SECRET_ID + ":" + SECRET_PASSWORD).toString("base64")}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Belvo API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-belvo", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_institutions",
      description: "List available financial institutions",
      inputSchema: {
        type: "object",
        properties: {
          country_code: { type: "string", description: "Country code filter (MX, CO, AR)" },
          type: { type: "string", enum: ["bank", "fiscal", "gig", "employment"], description: "Institution type" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "create_link",
      description: "Create a link to a financial institution",
      inputSchema: {
        type: "object",
        properties: {
          institution: { type: "string", description: "Institution name/code" },
          username: { type: "string", description: "User credentials - username" },
          password: { type: "string", description: "User credentials - password" },
          external_id: { type: "string", description: "External reference ID" },
          access_mode: { type: "string", enum: ["single", "recurrent"], description: "Access mode (default: single)" },
        },
        required: ["institution", "username", "password"],
      },
    },
    {
      name: "list_links",
      description: "List existing links",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
          institution: { type: "string", description: "Filter by institution" },
          access_mode: { type: "string", enum: ["single", "recurrent"], description: "Filter by access mode" },
        },
      },
    },
    {
      name: "get_accounts",
      description: "Get accounts for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries (default true)" },
        },
        required: ["link"],
      },
    },
    {
      name: "get_balances",
      description: "Get balances for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          account: { type: "string", description: "Account ID filter" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link", "date_from", "date_to"],
      },
    },
    {
      name: "get_transactions",
      description: "Get transactions for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          account: { type: "string", description: "Account ID filter" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link", "date_from", "date_to"],
      },
    },
    {
      name: "get_owners",
      description: "Get owner information for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link"],
      },
    },
    {
      name: "get_incomes",
      description: "Get income data for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link"],
      },
    },
    {
      name: "get_tax_returns",
      description: "Get tax returns for a link (fiscal institutions)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          year_from: { type: "string", description: "Start year (YYYY)" },
          year_to: { type: "string", description: "End year (YYYY)" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link", "year_from", "year_to"],
      },
    },
    {
      name: "get_investments",
      description: "Get investment portfolios for a link",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link"],
      },
    },
    {
      name: "get_link",
      description: "Retrieve details of a specific link by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Link ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_link",
      description: "Delete a link (and all its associated data) by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Link ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "patch_link",
      description: "Update a link's credentials or resume after MFA (PATCH /api/links/)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Link ID (UUID)" },
          password: { type: "string", description: "Updated user password" },
          password2: { type: "string", description: "Updated secondary password" },
          token: { type: "string", description: "MFA token to resume session" },
          username: { type: "string", description: "Updated username" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_accounts",
      description: "List stored accounts (GET /api/accounts/) with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Filter by link ID" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_account_detail",
      description: "Retrieve a stored account by account ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Account ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_transactions",
      description: "List stored transactions (GET /api/transactions/) with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Filter by link ID" },
          account: { type: "string", description: "Filter by account ID" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_transaction_detail",
      description: "Retrieve a stored transaction by transaction ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_balances",
      description: "List stored balances (GET /api/balances/) with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Filter by link ID" },
          account: { type: "string", description: "Filter by account ID" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "list_owners",
      description: "List stored owners (GET /api/owners/)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Filter by link ID" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "list_incomes",
      description: "List stored incomes (GET /api/incomes/)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Filter by link ID" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_employment_records",
      description: "Get employment records for a link (employment institutions)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link"],
      },
    },
    {
      name: "get_invoices",
      description: "Get invoices for a link (BR/MX fiscal institutions)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          type: { type: "string", enum: ["INFLOW", "OUTFLOW"], description: "Invoice direction" },
          attach_xml: { type: "boolean", description: "Include XML payload" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link", "date_from", "date_to", "type"],
      },
    },
    {
      name: "get_receivables_transactions",
      description: "Get receivables transactions for a link (payment rails / acquirer data)",
      inputSchema: {
        type: "object",
        properties: {
          link: { type: "string", description: "Link ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          token: { type: "string", description: "MFA token (if required)" },
          save_data: { type: "boolean", description: "Save data for future queries" },
        },
        required: ["link", "date_from", "date_to"],
      },
    },
    {
      name: "create_widget_token",
      description: "Create a short-lived access token for the Belvo Connect Widget",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Secret key ID (defaults to env BELVO_SECRET_ID)" },
          password: { type: "string", description: "Secret key password (defaults to env BELVO_SECRET_PASSWORD)" },
          scopes: { type: "string", description: "Comma-separated scopes (default: read_institutions,write_links)" },
          link_id: { type: "string", description: "Existing link ID (for update flow)" },
          widget: { type: "object", description: "Widget configuration object (callback_urls, branding, etc.)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_institutions": {
        const params = new URLSearchParams();
        if (args?.country_code) params.set("country_code", String(args.country_code));
        if (args?.type) params.set("type", String(args.type));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/institutions/?${params}`), null, 2) }] };
      }
      case "create_link": {
        const payload: any = {
          institution: args?.institution,
          username: args?.username,
          password: args?.password,
        };
        if (args?.external_id) payload.external_id = args.external_id;
        if (args?.access_mode) payload.access_mode = args.access_mode;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/links/", payload), null, 2) }] };
      }
      case "list_links": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.institution) params.set("institution", String(args.institution));
        if (args?.access_mode) params.set("access_mode", String(args.access_mode));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/links/?${params}`), null, 2) }] };
      }
      case "get_accounts": {
        const payload: any = { link: args?.link };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/accounts/", payload), null, 2) }] };
      }
      case "get_balances": {
        const payload: any = {
          link: args?.link,
          date_from: args?.date_from,
          date_to: args?.date_to,
        };
        if (args?.account) payload.account = args.account;
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/balances/", payload), null, 2) }] };
      }
      case "get_transactions": {
        const payload: any = {
          link: args?.link,
          date_from: args?.date_from,
          date_to: args?.date_to,
        };
        if (args?.account) payload.account = args.account;
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/transactions/", payload), null, 2) }] };
      }
      case "get_owners": {
        const payload: any = { link: args?.link };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/owners/", payload), null, 2) }] };
      }
      case "get_incomes": {
        const payload: any = { link: args?.link };
        if (args?.date_from) payload.date_from = args.date_from;
        if (args?.date_to) payload.date_to = args.date_to;
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/incomes/", payload), null, 2) }] };
      }
      case "get_tax_returns": {
        const payload: any = {
          link: args?.link,
          year_from: args?.year_from,
          year_to: args?.year_to,
        };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/tax-returns/", payload), null, 2) }] };
      }
      case "get_investments": {
        const payload: any = { link: args?.link };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/investments/portfolios/", payload), null, 2) }] };
      }
      case "get_link": {
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/links/${args?.id}/`), null, 2) }] };
      }
      case "delete_link": {
        const res = await fetch(`${BASE_URL}/api/links/${args?.id}/`, {
          method: "DELETE",
          headers: SECRET_ID && SECRET_PASSWORD
            ? { "Authorization": `Basic ${Buffer.from(SECRET_ID + ":" + SECRET_PASSWORD).toString("base64")}` }
            : {},
        });
        if (!res.ok && res.status !== 204) {
          const err = await res.text();
          throw new Error(`Belvo API ${res.status}: ${err}`);
        }
        return { content: [{ type: "text", text: JSON.stringify({ deleted: true, id: args?.id }, null, 2) }] };
      }
      case "patch_link": {
        const payload: any = {};
        if (args?.password) payload.password = args.password;
        if (args?.password2) payload.password2 = args.password2;
        if (args?.token) payload.token = args.token;
        if (args?.username) payload.username = args.username;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("PATCH", `/api/links/${args?.id}/`, payload), null, 2) }] };
      }
      case "list_accounts": {
        const params = new URLSearchParams();
        if (args?.link) params.set("link", String(args.link));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/accounts/?${params}`), null, 2) }] };
      }
      case "get_account_detail": {
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/accounts/${args?.id}/`), null, 2) }] };
      }
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.link) params.set("link", String(args.link));
        if (args?.account) params.set("account", String(args.account));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/transactions/?${params}`), null, 2) }] };
      }
      case "get_transaction_detail": {
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/transactions/${args?.id}/`), null, 2) }] };
      }
      case "list_balances": {
        const params = new URLSearchParams();
        if (args?.link) params.set("link", String(args.link));
        if (args?.account) params.set("account", String(args.account));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/balances/?${params}`), null, 2) }] };
      }
      case "list_owners": {
        const params = new URLSearchParams();
        if (args?.link) params.set("link", String(args.link));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/owners/?${params}`), null, 2) }] };
      }
      case "list_incomes": {
        const params = new URLSearchParams();
        if (args?.link) params.set("link", String(args.link));
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("GET", `/api/incomes/?${params}`), null, 2) }] };
      }
      case "get_employment_records": {
        const payload: any = { link: args?.link };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/employment-records/", payload), null, 2) }] };
      }
      case "get_invoices": {
        const payload: any = {
          link: args?.link,
          date_from: args?.date_from,
          date_to: args?.date_to,
          type: args?.type,
        };
        if (args?.attach_xml !== undefined) payload.attach_xml = args.attach_xml;
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/invoices/", payload), null, 2) }] };
      }
      case "get_receivables_transactions": {
        const payload: any = {
          link: args?.link,
          date_from: args?.date_from,
          date_to: args?.date_to,
        };
        if (args?.token) payload.token = args.token;
        if (args?.save_data !== undefined) payload.save_data = args.save_data;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/receivables/transactions/", payload), null, 2) }] };
      }
      case "create_widget_token": {
        const payload: any = {
          id: args?.id || SECRET_ID,
          password: args?.password || SECRET_PASSWORD,
          scopes: args?.scopes || "read_institutions,write_links,read_consents,write_consents,write_consent_callback",
        };
        if (args?.link_id) payload.link_id = args.link_id;
        if (args?.widget) payload.widget = args.widget;
        return { content: [{ type: "text", text: JSON.stringify(await belvoRequest("POST", "/api/token/", payload), null, 2) }] };
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
        const s = new Server({ name: "mcp-belvo", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
