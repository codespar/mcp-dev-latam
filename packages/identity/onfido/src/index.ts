#!/usr/bin/env node

/**
 * MCP Server for Onfido — global identity verification & KYC.
 *
 * Onfido is the identity verification layer used by Revolut, N26, Uber and
 * hundreds of regulated fintechs. One API covers 195+ countries and the full
 * KYC flow: applicant record → document upload → live photo → check (runs
 * the verification reports) → retrieve per-report results.
 *
 * Tools (20):
 *   create_applicant        — create the person record
 *   retrieve_applicant      — fetch an applicant by id
 *   update_applicant        — update applicant fields
 *   delete_applicant        — soft-delete an applicant
 *   upload_document         — upload an ID document image (multipart)
 *   retrieve_document       — fetch a document by id
 *   list_documents          — list documents for an applicant
 *   download_document       — download raw document bytes (base64)
 *   upload_live_photo       — upload a selfie / live photo (multipart)
 *   retrieve_live_photo     — fetch a live photo by id
 *   list_live_photos        — list live photos for an applicant
 *   create_check            — run verification (document, facial_similarity_photo, watchlist, etc)
 *   retrieve_check          — poll a check; includes per-report status
 *   resume_check            — resume a paused check
 *   list_checks             — list checks for an applicant
 *   retrieve_report         — fetch an individual report (one component of a check)
 *   list_reports            — list reports under a given check
 *   create_workflow_run     — start an Onfido Studio workflow run (the newer orchestrated product)
 *   retrieve_workflow_run   — poll a workflow run for progress / outcome
 *   generate_sdk_token      — mint a short-lived token for the Onfido Web / Mobile SDKs
 *
 * Authentication
 *   Authorization: Token token=<ONFIDO_API_TOKEN>    (Onfido's unusual non-Bearer format)
 *
 * Environment
 *   ONFIDO_API_TOKEN   — API token (required, secret)
 *   ONFIDO_REGION      — 'eu' | 'us' | 'ca' (optional; default api.onfido.com)
 *
 * API version: v3.6 (current stable per Onfido docs, 2023-01-24 release)
 * Docs: https://documentation.onfido.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.ONFIDO_API_TOKEN || "";
const REGION = (process.env.ONFIDO_REGION || "").toLowerCase();

function regionHost(r: string): string {
  switch (r) {
    case "eu": return "https://api.eu.onfido.com";
    case "us": return "https://api.us.onfido.com";
    case "ca": return "https://api.ca.onfido.com";
    default:   return "https://api.onfido.com";
  }
}
const BASE_URL = `${regionHost(REGION)}/v3.6`;

type RequestOpts = { multipart?: boolean; raw?: boolean };

async function onfidoRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOpts = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Authorization": `Token token=${API_TOKEN}`,
    "Accept": "application/json",
  };

  let payload: BodyInit | undefined;
  if (opts.multipart && body && typeof body === "object") {
    const fd = new FormData();
    const fileFieldCandidates = ["file", "file_base64", "file_url"];
    const rec = body as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (v === undefined || v === null) continue;
      if (fileFieldCandidates.includes(k) && k === "file" && typeof v === "string") {
        // Expect base64-encoded file contents; wrap as a Blob.
        const filename = typeof rec.file_name === "string" ? rec.file_name : "upload";
        const mime = typeof rec.content_type === "string" ? rec.content_type : "application/octet-stream";
        const bytes = Buffer.from(v, "base64");
        fd.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
      } else if (k === "file_name" || k === "content_type") {
        // Consumed alongside "file".
        continue;
      } else {
        fd.append(k, String(v));
      }
    }
    payload = fd;
    // Do NOT set Content-Type — fetch adds the multipart boundary automatically.
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Onfido API ${res.status}: ${err}`);
  }
  if (opts.raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      content_type: res.headers.get("content-type") || "application/octet-stream",
      content_length: buf.length,
      file_base64: buf.toString("base64"),
    };
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-onfido", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_applicant",
      description: "Create an Onfido applicant — the person record that documents, live photos, and checks attach to. Required before any verification.",
      inputSchema: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "Legal first name" },
          last_name: { type: "string", description: "Legal last name" },
          email: { type: "string", description: "Applicant email (optional but recommended)" },
          dob: { type: "string", description: "Date of birth, YYYY-MM-DD" },
          address: {
            type: "object",
            description: "Residential address. Country is always required if an address is provided.",
            properties: {
              flat_number: { type: "string" },
              building_number: { type: "string" },
              building_name: { type: "string" },
              street: { type: "string" },
              sub_street: { type: "string" },
              town: { type: "string" },
              state: { type: "string", description: "State / province code" },
              postcode: { type: "string" },
              country: { type: "string", description: "ISO-3166 alpha-3 country code (e.g. GBR, USA, BRA)" },
            },
            required: ["country"],
          },
          id_numbers: {
            type: "array",
            description: "Array of identity numbers (SSN, national ID, etc). Each: { type, value, state_code? }",
            items: { type: "object" },
          },
        },
        required: ["first_name", "last_name"],
      },
    },
    {
      name: "retrieve_applicant",
      description: "Retrieve an applicant by id.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "update_applicant",
      description: "Update fields on an existing applicant. Send only the fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          dob: { type: "string", description: "YYYY-MM-DD" },
          address: { type: "object", description: "Replacement address object" },
          id_numbers: { type: "array", items: { type: "object" } },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "upload_document",
      description: "Upload an identity document image for an applicant. Sent as multipart/form-data. Pass file as base64-encoded bytes plus file_name and content_type (image/jpeg, image/png, application/pdf).",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID this document belongs to" },
          type: {
            type: "string",
            description: "Document type",
            enum: ["passport", "driving_licence", "national_identity_card", "voter_id", "work_permit", "residence_permit", "unknown"],
          },
          side: {
            type: "string",
            description: "Side of the document. Required for 2-sided types (driving_licence, national_identity_card). Omit for passport.",
            enum: ["front", "back"],
          },
          issuing_country: { type: "string", description: "ISO-3166 alpha-3 country code of issuer (e.g. GBR, USA, BRA)" },
          file: { type: "string", description: "Base64-encoded file contents" },
          file_name: { type: "string", description: "Original filename (e.g. 'passport.jpg')" },
          content_type: { type: "string", description: "MIME type (image/jpeg, image/png, application/pdf)" },
        },
        required: ["applicant_id", "type", "file", "file_name", "content_type"],
      },
    },
    {
      name: "retrieve_document",
      description: "Retrieve document metadata by id.",
      inputSchema: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "Onfido document UUID" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "upload_live_photo",
      description: "Upload a live photo (selfie) for an applicant, used by facial_similarity_photo reports. Sent as multipart/form-data. NOTE: Onfido recommends capturing live photos via their SDK; direct API upload may be restricted on some accounts.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
          file: { type: "string", description: "Base64-encoded file contents" },
          file_name: { type: "string", description: "Original filename (e.g. 'selfie.jpg')" },
          content_type: { type: "string", description: "MIME type (image/jpeg, image/png)" },
          advanced_validation: { type: "boolean", description: "Enable face-detection validation at upload (default true)" },
        },
        required: ["applicant_id", "file", "file_name", "content_type"],
      },
    },
    {
      name: "retrieve_live_photo",
      description: "Retrieve a live photo record by id.",
      inputSchema: {
        type: "object",
        properties: {
          live_photo_id: { type: "string", description: "Onfido live photo UUID" },
        },
        required: ["live_photo_id"],
      },
    },
    {
      name: "create_check",
      description: "Run a verification check on an applicant. A check is a bundle of one or more reports (document, facial_similarity_photo, watchlist, etc). This is the step that actually triggers the verification.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
          report_names: {
            type: "array",
            description: "Reports to run. Common: 'document', 'facial_similarity_photo', 'watchlist_standard', 'known_faces', 'identity_enhanced', 'proof_of_address', 'watchlist_peps_only', 'watchlist_sanctions_only'.",
            items: { type: "string" },
          },
          document_ids: {
            type: "array",
            description: "Optional: specific document ids to include. Defaults to most recent uploads.",
            items: { type: "string" },
          },
          applicant_provides_data: { type: "boolean", description: "If true, Onfido uses applicant-provided data instead of extracting from docs" },
          asynchronous: { type: "boolean", description: "Run asynchronously (default true). When true, poll retrieve_check for results." },
          tags: { type: "array", items: { type: "string" }, description: "Merchant-side tags (shown in dashboard)" },
          suppress_from_email: { type: "boolean", description: "Suppress email notifications for this check" },
        },
        required: ["applicant_id", "report_names"],
      },
    },
    {
      name: "retrieve_check",
      description: "Retrieve a check by id. Returns the overall status ('in_progress' | 'awaiting_applicant' | 'complete' | 'withdrawn' | 'paused' | 'reopened'), result ('clear' | 'consider'), and ids of contained reports — poll this to track progress.",
      inputSchema: {
        type: "object",
        properties: {
          check_id: { type: "string", description: "Onfido check UUID" },
        },
        required: ["check_id"],
      },
    },
    {
      name: "list_checks",
      description: "List all checks for a given applicant.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "retrieve_report",
      description: "Retrieve an individual report by id. A report is one verification component of a check (e.g. the document report, the facial_similarity report). Contains the detailed breakdown of sub-checks.",
      inputSchema: {
        type: "object",
        properties: {
          report_id: { type: "string", description: "Onfido report UUID" },
        },
        required: ["report_id"],
      },
    },
    {
      name: "delete_applicant",
      description: "Soft-delete an applicant. Onfido retains the record for 30 days before permanent deletion; during that window it can be restored via the dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "list_documents",
      description: "List all documents uploaded for a given applicant.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "download_document",
      description: "Download the raw binary of an uploaded document. Returns the bytes as base64 plus content_type. Useful for re-viewing or re-processing after upload.",
      inputSchema: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "Onfido document UUID" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "list_live_photos",
      description: "List all live photos (selfies) uploaded for a given applicant.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID" },
        },
        required: ["applicant_id"],
      },
    },
    {
      name: "resume_check",
      description: "Resume a check that was paused (typically awaiting_applicant or paused states). No-op on checks that are already running / complete.",
      inputSchema: {
        type: "object",
        properties: {
          check_id: { type: "string", description: "Onfido check UUID" },
        },
        required: ["check_id"],
      },
    },
    {
      name: "list_reports",
      description: "List the reports contained within a given check.",
      inputSchema: {
        type: "object",
        properties: {
          check_id: { type: "string", description: "Onfido check UUID to list reports for" },
        },
        required: ["check_id"],
      },
    },
    {
      name: "create_workflow_run",
      description: "Start an Onfido Studio workflow run. Studio is Onfido's newer product: instead of manually orchestrating checks/reports, you configure a workflow in the dashboard and trigger it here. The run drives the applicant through document capture, facial similarity, watchlist, etc automatically.",
      inputSchema: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "UUID of the workflow defined in Onfido Studio" },
          applicant_id: { type: "string", description: "Onfido applicant UUID to run the workflow against" },
          custom_data: { type: "object", description: "Optional arbitrary key/value data surfaced to the workflow and reports" },
          tags: { type: "array", items: { type: "string" }, description: "Merchant-side tags attached to the run" },
          link: {
            type: "object",
            description: "Optional configuration for the applicant-facing URL (completed_redirect_url, expired_redirect_url, language, etc).",
          },
        },
        required: ["workflow_id", "applicant_id"],
      },
    },
    {
      name: "retrieve_workflow_run",
      description: "Retrieve a workflow run by id. Returns status ('awaiting_input' | 'processing' | 'approved' | 'declined' | 'review' | 'abandoned' | 'error'), output data, link and sdk_token (if applicable).",
      inputSchema: {
        type: "object",
        properties: {
          workflow_run_id: { type: "string", description: "Onfido workflow run UUID" },
        },
        required: ["workflow_run_id"],
      },
    },
    {
      name: "generate_sdk_token",
      description: "Mint a short-lived SDK token for embedding the Onfido Web / iOS / Android SDKs in your frontend. The token is scoped to a single applicant and is how capture flows (document photo, selfie, video) run in-browser/in-app without exposing your API token.",
      inputSchema: {
        type: "object",
        properties: {
          applicant_id: { type: "string", description: "Onfido applicant UUID this token authorizes" },
          application_id: { type: "string", description: "iOS/Android bundle identifier — required for mobile SDKs" },
          referrer: { type: "string", description: "Allowed referrer pattern for Web SDK (e.g. 'https://*.example.com/*')" },
        },
        required: ["applicant_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_applicant":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/applicants/", a), null, 2) }] };
      case "retrieve_applicant":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/applicants/${a.applicant_id}`), null, 2) }] };
      case "update_applicant": {
        const { applicant_id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("PUT", `/applicants/${applicant_id}`, rest), null, 2) }] };
      }
      case "upload_document":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/documents/", a, { multipart: true }), null, 2) }] };
      case "retrieve_document":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/documents/${a.document_id}`), null, 2) }] };
      case "upload_live_photo":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/live_photos/", a, { multipart: true }), null, 2) }] };
      case "retrieve_live_photo":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/live_photos/${a.live_photo_id}`), null, 2) }] };
      case "create_check":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/checks/", a), null, 2) }] };
      case "retrieve_check":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/checks/${a.check_id}`), null, 2) }] };
      case "list_checks": {
        const q = encodeURIComponent(String(a.applicant_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/checks?applicant_id=${q}`), null, 2) }] };
      }
      case "retrieve_report":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/reports/${a.report_id}`), null, 2) }] };
      case "delete_applicant":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("DELETE", `/applicants/${a.applicant_id}`), null, 2) }] };
      case "list_documents": {
        const q = encodeURIComponent(String(a.applicant_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/documents?applicant_id=${q}`), null, 2) }] };
      }
      case "download_document":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/documents/${a.document_id}/download`, undefined, { raw: true }), null, 2) }] };
      case "list_live_photos": {
        const q = encodeURIComponent(String(a.applicant_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/live_photos?applicant_id=${q}`), null, 2) }] };
      }
      case "resume_check":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", `/checks/${a.check_id}/resume`), null, 2) }] };
      case "list_reports": {
        const q = encodeURIComponent(String(a.check_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/reports?check_id=${q}`), null, 2) }] };
      }
      case "create_workflow_run":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/workflow_runs/", a), null, 2) }] };
      case "retrieve_workflow_run":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("GET", `/workflow_runs/${a.workflow_run_id}`), null, 2) }] };
      case "generate_sdk_token":
        return { content: [{ type: "text", text: JSON.stringify(await onfidoRequest("POST", "/sdk_token", a), null, 2) }] };
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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-onfido", version: "0.2.0" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
