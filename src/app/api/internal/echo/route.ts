import { verifySignature } from "@/lib/webhooks";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";

/**
 * Echo target that verifies FormForge webhook signatures end to end.
 * Used by the health monitor (system workspace) and the demo workspace's sample webhook.
 * The secret is looked up from the delivery id header, so any FormForge webhook pointed here verifies.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-formforge-signature") ?? "";
  const deliveryId = req.headers.get("x-formforge-delivery") ?? "";
  const row = getDb().prepare("SELECT w.secret FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = ?").get(deliveryId) as { secret: string } | undefined;
  const valid = !!row && verifySignature(row.secret, raw, sig);
  return Response.json({ ok: valid, verified: valid, bytes: raw.length, received_at: new Date().toISOString() }, { status: valid ? 200 : 401 });
}
