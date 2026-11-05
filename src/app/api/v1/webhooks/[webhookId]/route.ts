import { apiRoute, optionsHandler, readJson, notFound } from "@/lib/api";
import { updateWebhook, deleteWebhook, getWebhook } from "@/lib/webhooks";
export const dynamic = "force-dynamic";
export const PATCH = apiRoute("automations:write", async ({ auth, params, req }) => {
  if (!getWebhook(auth.workspaceId, params.webhookId)) notFound("Webhook");
  const b = await readJson(req);
  const h = updateWebhook(auth.workspaceId, params.webhookId, { ...b, ...(b.include_spam !== undefined ? { includeSpam: b.include_spam } : {}) });
  return { id: h.id, form_id: h.formId, url: h.url, events: h.events, include_spam: h.includeSpam, active: h.active };
});
export const DELETE = apiRoute("automations:write", async ({ auth, params }) => { if (!deleteWebhook(auth.workspaceId, params.webhookId)) notFound("Webhook"); return { deleted: true, id: params.webhookId }; });
export const OPTIONS = optionsHandler;
