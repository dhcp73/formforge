import { apiRoute, optionsHandler, notFound } from "@/lib/api";
import { getWebhook, createDelivery, attemptDelivery, getDelivery } from "@/lib/webhooks";
export const dynamic = "force-dynamic";
export const POST = apiRoute("automations:write", async ({ auth, params }) => {
  const h = getWebhook(auth.workspaceId, params.webhookId) ?? notFound("Webhook");
  const id = createDelivery(h, "webhook.test", { event: "webhook.test", created_at: new Date().toISOString(), message: "Test event from FormForge" }, null);
  const r = await attemptDelivery(id);
  const d = getDelivery(auth.workspaceId, id)!;
  return { delivery_id: id, result: r.result, response_status: d.response_status, error: d.error, duration_ms: d.duration_ms };
});
export const OPTIONS = optionsHandler;
