import { apiRoute, optionsHandler, notFound } from "@/lib/api";
import { getWebhook, listDeliveries } from "@/lib/webhooks";
export const dynamic = "force-dynamic";
export const GET = apiRoute("automations:read", async ({ auth, params }) => {
  if (!getWebhook(auth.workspaceId, params.webhookId)) notFound("Webhook");
  return { data: listDeliveries(auth.workspaceId, { webhookId: params.webhookId }).map(({ payload: _p, ...d }) => { void _p; return d; }) };
});
export const OPTIONS = optionsHandler;
