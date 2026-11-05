import { apiRoute, optionsHandler, readJson, notFound } from "@/lib/api";
import { getForm } from "@/lib/forms";
import { listWebhooks } from "@/lib/webhooks";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("automations:read", async ({ auth, params }) => {
  if (!getForm(auth.workspaceId, params.formId)) notFound("Form");
  return { data: listWebhooks(auth.workspaceId, params.formId).map((h) => ({ id: h.id, form_id: h.formId, url: h.url, events: h.events, include_spam: h.includeSpam, active: h.active, created_at: h.createdAt })) };
});
export const POST = apiRoute("automations:write", async ({ auth, params, req }) => {
  const b = await readJson(req);
  return Response.json(svc.createWebhook(auth.workspaceId, params.formId, { url: b.url, events: b.events, includeSpam: b.include_spam, active: b.active }), { status: 201 });
});
export const OPTIONS = optionsHandler;
