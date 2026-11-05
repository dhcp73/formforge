import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FormForgeBackend } from "./backend";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }] });
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

export const MCP_TOOLS = ["list_forms", "get_form", "create_form", "list_submissions", "get_submission", "search_submissions", "create_webhook", "enrich_submission", "research_company", "get_stats"];

export function createMcpServer(backend: FormForgeBackend) {
  const server = new McpServer({ name: "formforge", version: "1.0.0" });
  server.registerTool("list_forms", { title: "List forms", description: "List all forms in the workspace with endpoint URLs and submission counts." }, wrap(async () => backend.listForms()));
  server.registerTool("get_form", { title: "Get form", description: "Get one form including its settings.", inputSchema: { form_id: z.string() } }, wrap(async (a: { form_id: string }) => backend.getForm(a.form_id)));
  server.registerTool("create_form", {
    title: "Create form", description: "Create a new form endpoint. Returns the public POST endpoint URL.",
    inputSchema: { name: z.string().min(1), description: z.string().optional(), redirect_url: z.string().url().optional(), notify_emails: z.array(z.string().email()).optional() },
  }, wrap(async (a: { name: string; description?: string; redirect_url?: string; notify_emails?: string[] }) =>
    backend.createForm({ name: a.name, description: a.description, settings: { ...(a.redirect_url ? { redirectUrl: a.redirect_url } : {}), ...(a.notify_emails ? { notifyEmails: a.notify_emails } : {}) } })));
  server.registerTool("list_submissions", {
    title: "List submissions", description: "List submissions for a form, newest first. Supports spam filter and pagination.",
    inputSchema: { form_id: z.string(), spam: z.enum(["true", "false", "all"]).optional(), page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional(), since: z.string().optional() },
  }, wrap(async (a: { form_id: string; spam?: string; page?: number; limit?: number; since?: string }) => backend.listSubmissions(a.form_id, { spam: a.spam, page: a.page, limit: a.limit ?? 20, since: a.since })));
  server.registerTool("get_submission", { title: "Get submission", description: "Get a submission with answers, enrichment (with per-field source), routing decision and spam analysis.", inputSchema: { submission_id: z.string() } }, wrap(async (a: { submission_id: string }) => backend.getSubmission(a.submission_id)));
  server.registerTool("search_submissions", {
    title: "Search submissions", description: "Full-text search across submission answers, company and country.",
    inputSchema: { query: z.string().min(1), form_id: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
  }, wrap(async (a: { query: string; form_id?: string; limit?: number }) => backend.searchSubmissions(a.query, a.form_id, a.limit ?? 20)));
  server.registerTool("create_webhook", {
    title: "Create webhook", description: "Register an HMAC-signed webhook for a form. Returns the signing secret.",
    inputSchema: { form_id: z.string(), url: z.string().url(), events: z.array(z.enum(["submission.created", "submission.enriched", "submission.routed"])).optional(), include_spam: z.boolean().optional() },
  }, wrap(async (a: { form_id: string; url: string; events?: string[]; include_spam?: boolean }) => backend.createWebhook(a.form_id, { url: a.url, events: a.events, include_spam: a.include_spam })));
  server.registerTool("enrich_submission", { title: "Re-enrich submission", description: "Re-run the enrichment waterfall (offline → Apollo → Valyu → AI) and routing for a submission.", inputSchema: { submission_id: z.string() } }, wrap(async (a: { submission_id: string }) => backend.enrichSubmission(a.submission_id)));
  server.registerTool("research_company", {
    title: "Research company (Valyu)", description: "Research a company by domain/name. mode=search is instant; fast|standard|heavy|max start an async DeepResearch task (credits: 25/100/500/2500).",
    inputSchema: { domain: z.string().optional(), company: z.string().optional(), mode: z.enum(["search", "fast", "standard", "heavy", "max"]).optional(), submission_id: z.string().optional() },
  }, wrap(async (a: { domain?: string; company?: string; mode?: string; submission_id?: string }) => backend.researchCompany(a)));
  server.registerTool("get_stats", { title: "Workspace stats", description: "Submission totals, spam rate, 14-day series, routing per owner and enrichment hit rates." }, wrap(async () => backend.stats()));
  return server;
}
