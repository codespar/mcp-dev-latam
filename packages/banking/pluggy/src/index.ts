#!/usr/bin/env node

/**
 * MCP Server for Pluggy — Open Finance Brasil aggregator (ITP/TPP).
 *
 * Pluggy holds the ICP-Brasil certificate and runs Dynamic Client
 * Registration with each Brazilian bank, exposing a single API for
 * account discovery, transactions, balances, and payments initiation.
 *
 * Status: ALPHA SCAFFOLD. The package + server.json reserve the
 * catalog slot and document the env contract; the tool surface is a
 * single `health_check` placeholder until the real toolset (list
 * connectors, create item, list accounts, list transactions, payments
 * initiation) lands in a follow-on PR.
 *
 * Auth: Pluggy uses an OAuth2 client-credentials handshake to mint a
 * short-lived API key (POST /auth) which then authorizes the rest of
 * the API. PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET are issued at the
 * Pluggy dashboard (https://dashboard.pluggy.ai).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "pluggy",
  version: "0.0.1-alpha",
});

server.tool(
  "health_check",
  "Verifies that the Pluggy MCP server is running and that PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET are set in the environment. Returns 'configured' / 'missing-creds' so the caller can fail fast before invoking the real toolset (which lands in a follow-on PR).",
  {},
  async () => {
    const id = process.env.PLUGGY_CLIENT_ID;
    const secret = process.env.PLUGGY_CLIENT_SECRET;
    const status = id && secret ? "configured" : "missing-creds";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              server: "pluggy",
              version: "0.0.1-alpha",
              status,
              has_client_id: Boolean(id),
              has_client_secret: Boolean(secret),
              note: "Real toolset (list_connectors, create_item, list_accounts, list_transactions, payments_initiation) ships in a follow-on PR. See README.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Compile-time hint: when adding a new tool, register it here. Keep
// the param schema as a Zod object so the SDK builds the JSON Schema
// for you. Add the tool to the README "Tools" section.
void z; // satisfies the linter while we have no other Zod usages

const transport = new StdioServerTransport();
await server.connect(transport);
