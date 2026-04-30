#!/usr/bin/env node

/**
 * MCP Server for Iniciador — Open Finance Brasil PISP aggregator
 * (Pix payment initiation).
 *
 * Iniciador is positioned as the payment-initiation half of OFB —
 * complementary to data-side aggregators (Pluggy, Belvo). Where
 * Pluggy/Belvo specialize in account + transaction reads, Iniciador
 * specializes in writing: initiating Pix payments on the consumer's
 * behalf via OFB's payments rail (PISP role).
 *
 * Status: ALPHA SCAFFOLD. The package + server.json reserve the
 * catalog slot. Today's tool surface is a single `health_check`
 * placeholder. The real toolset — initiate_pix, get_payment_status,
 * list_payments, schedule_recurring_pix — lands in follow-on PRs.
 *
 * Auth: OAuth2 client_credentials. INICIADOR_CLIENT_ID +
 * INICIADOR_CLIENT_SECRET issued during Iniciador onboarding.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "iniciador",
  version: "0.0.1-alpha",
});

server.tool(
  "health_check",
  "Verifies that the Iniciador MCP server is running and that INICIADOR_CLIENT_ID + INICIADOR_CLIENT_SECRET are set in the environment. Returns 'configured' / 'missing-creds' so callers can fail fast before invoking the real toolset (which lands in a follow-on PR).",
  {},
  async () => {
    const id = process.env.INICIADOR_CLIENT_ID;
    const secret = process.env.INICIADOR_CLIENT_SECRET;
    const baseUrl = process.env.INICIADOR_API_BASE ?? "(default)";
    const status = id && secret ? "configured" : "missing-creds";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              server: "iniciador",
              version: "0.0.1-alpha",
              status,
              api_base: baseUrl,
              has_client_id: Boolean(id),
              has_client_secret: Boolean(secret),
              note: "Real toolset (initiate_pix, get_payment_status, list_payments, schedule_recurring_pix) ships in a follow-on PR. See README.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

void z;

const transport = new StdioServerTransport();
await server.connect(transport);
