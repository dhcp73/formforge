import { getResearchTaskByExternal, researchSecret, completeResearch } from "@/lib/enrich/pipeline";
import { resolveProvider } from "@/lib/integrations/store";
import { getDeepResearchStatus, verifyValyuSignature } from "@/lib/integrations/valyu";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Valyu DeepResearch completion webhook. Verified with the per-task webhook_secret returned at creation. */
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const ext = String(body.deepresearch_id ?? body.id ?? body.task_id ?? "");
  const task = ext ? getResearchTaskByExternal(ext) : undefined;
  if (!task) return Response.json({ ok: false, error: "Unknown task" }, { status: 404 });
  const secret = researchSecret(task);
  if (!secret || !verifyValyuSignature(raw, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"), secret)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }
  let status = body as { status?: string; output?: unknown; error?: string; sources?: { url: string }[] };
  if (status.status === "completed" && status.output === undefined) {
    const cfg = resolveProvider(task.workspace_id, "valyu");
    if (cfg.configured) status = await getDeepResearchStatus(String(cfg.config.apiKey), ext);
  }
  const merged = await completeResearch(task, status);
  return Response.json({ ok: true, merged });
}
