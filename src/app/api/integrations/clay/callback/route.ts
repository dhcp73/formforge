import { getSubmissionById } from "@/lib/submissions";
import { resolveProvider } from "@/lib/integrations/store";
import { clayToFields } from "@/lib/integrations/clay";
import { mergeIntoSubmission } from "@/lib/processing";
import { safeEqual, hmacHex } from "@/lib/secrets";
import { logEnrichment } from "@/lib/enrich/pipeline";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clay → FormForge callback. Authenticate with either:
 *  - X-FormForge-Clay-Secret: <callback secret>   (static header from Clay's HTTP API action), or
 *  - X-FormForge-Signature: sha256=<hex HMAC of raw body with the callback secret>
 * Body must include submission_id plus any enriched columns.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const id = String(body.submission_id ?? body.submissionId ?? "");
  const sub = id ? getSubmissionById(id) : null;
  if (!sub) return Response.json({ ok: false, error: "Unknown submission_id" }, { status: 404 });
  const cfg = resolveProvider(sub.workspaceId, "clay");
  const secret = String(cfg.config.callbackSecret ?? "");
  const header = req.headers.get("x-formforge-clay-secret");
  const sig = req.headers.get("x-formforge-signature");
  const ok = !!secret && ((header && safeEqual(header, secret)) || (sig && safeEqual(sig, `sha256=${hmacHex(secret, raw)}`)));
  if (!ok) return Response.json({ ok: false, error: "Invalid or missing callback secret" }, { status: 401 });
  const written = await mergeIntoSubmission(sub.id, "clay", clayToFields(body), { message: "Clay callback merged", rerunRouting: cfg.config.rerunRouting !== false, raw: body });
  logEnrichment(sub.workspaceId, sub.id, "clay", "success", 0, { message: `callback merged ${written.length} fields` });
  return Response.json({ ok: true, submission_id: sub.id, fields_written: written });
}
