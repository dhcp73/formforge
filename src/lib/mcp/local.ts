import { svc } from "../service";
import { ApiError } from "../api";
import type { Scope } from "../types";
import type { FormForgeBackend } from "./backend";

/** In-process backend for /api/mcp. Every tool enforces the same scope as its REST equivalent. */
export function localBackend(ws: string, scopes: readonly Scope[] | "all" = "all"): FormForgeBackend {
  const need = (s: Scope) => { if (scopes !== "all" && !scopes.includes(s)) throw new ApiError(403, `This API key lacks the "${s}" scope`, "insufficient_scope"); };
  return {
    listForms: async () => { need("forms:read"); return { data: svc.listForms(ws) }; },
    getForm: async (id) => { need("forms:read"); return svc.getForm(ws, id); },
    createForm: async (input) => { need("forms:write"); return svc.createForm(ws, input); },
    listSubmissions: async (formId, q) => { need("submissions:read"); return svc.listSubmissions(ws, { formId, ...q } as never); },
    getSubmission: async (id) => { need("submissions:read"); return svc.getSubmission(ws, id); },
    searchSubmissions: async (q, formId, limit) => { need("submissions:read"); return svc.listSubmissions(ws, { q, formId, limit, spam: "all" }); },
    createWebhook: async (formId, input) => { need("automations:write"); return svc.createWebhook(ws, formId, { url: input.url, events: input.events, includeSpam: input.include_spam }); },
    enrichSubmission: async (id) => { need("submissions:write"); return svc.enrichSubmission(ws, id); },
    researchCompany: async (input) => { need("submissions:write"); return svc.researchCompany(ws, input); },
    stats: async () => { need("submissions:read"); return svc.stats(ws); },
  };
}
