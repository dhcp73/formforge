import { z } from "zod";
import { getDb, now, parseJson } from "./db";
import { newId, randomString } from "./ids";
import { hmacHex, safeEqual } from "./secrets";

export const webhookInputSchema = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), "URL must be http(s)"),
  events: z.array(z.enum(["submission.created", "submission.enriched", "submission.routed", "enrichment.completed", "routing.assigned"])).default(["submission.created"]),
  includeSpam: z.boolean().default(false),
  active: z.boolean().default(true),
});

export interface Webhook { id: string; formId: string; workspaceId: string; url: string; secret: string; events: string[]; includeSpam: boolean; active: boolean; createdAt: string }
type Row = { id: string; form_id: string; workspace_id: string; url: string; secret: string; events: string; include_spam: number; active: number; created_at: string };
const map = (r: Row): Webhook => ({ id: r.id, formId: r.form_id, workspaceId: r.workspace_id, url: r.url, secret: r.secret, events: parseJson(r.events, []), includeSpam: !!r.include_spam, active: !!r.active, createdAt: r.created_at });

export const RETRY_DELAYS_S = [0, 30, 120, 600, 3600];
export const MAX_ATTEMPTS = RETRY_DELAYS_S.length;
const retryScale = () => Number(process.env.FORMFORGE_RETRY_SCALE ?? 1);

export function createWebhook(ws: string, formId: string, input: unknown): Webhook {
  const v = webhookInputSchema.parse(input);
  const id = newId("wh");
  getDb().prepare("INSERT INTO webhooks (id, form_id, workspace_id, url, secret, events, include_spam, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, formId, ws, v.url, `whsec_${randomString(32)}`, JSON.stringify(v.events), v.includeSpam ? 1 : 0, v.active ? 1 : 0, now());
  return getWebhook(ws, id)!;
}
export function getWebhook(ws: string, id: string) {
  const r = getDb().prepare("SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?").get(id, ws) as Row | undefined;
  return r ? map(r) : null;
}
export function listWebhooks(ws: string, formId?: string): Webhook[] {
  const rows = formId
    ? (getDb().prepare("SELECT * FROM webhooks WHERE workspace_id = ? AND form_id = ? ORDER BY created_at").all(ws, formId) as Row[])
    : (getDb().prepare("SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at").all(ws) as Row[]);
  return rows.map(map);
}
export function updateWebhook(ws: string, id: string, input: unknown) {
  const cur = getWebhook(ws, id);
  if (!cur) throw new Error("Webhook not found");
  const v = webhookInputSchema.parse({ ...cur, ...(input as object) });
  getDb().prepare("UPDATE webhooks SET url = ?, events = ?, include_spam = ?, active = ? WHERE id = ?").run(v.url, JSON.stringify(v.events), v.includeSpam ? 1 : 0, v.active ? 1 : 0, id);
  return getWebhook(ws, id)!;
}
export function deleteWebhook(ws: string, id: string) {
  return getDb().prepare("DELETE FROM webhooks WHERE id = ? AND workspace_id = ?").run(id, ws).changes > 0;
}

/** Signature header: `t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<body>")>` */
export function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmacHex(secret, `${t}.${body}`)}`;
}
export function verifySignature(secret: string, body: string, header: string, toleranceS = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceS) return false;
  return safeEqual(parts.v1, hmacHex(secret, `${t}.${body}`));
}

export interface Delivery {
  id: string; webhook_id: string; workspace_id: string; form_id: string; submission_id: string | null; event: string; payload: string;
  status: string; attempts: number; response_status: number | null; response_body: string | null; error: string | null; duration_ms: number | null;
  next_attempt_at: string | null; created_at: string; updated_at: string;
}

export function createDelivery(hook: Webhook, event: string, payload: unknown, submissionId: string | null) {
  const id = newId("dlv");
  const ts = now();
  getDb().prepare("INSERT INTO webhook_deliveries (id, webhook_id, workspace_id, form_id, submission_id, event, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
    .run(id, hook.id, hook.workspaceId, hook.formId, submissionId, event, JSON.stringify(payload), ts, ts);
  return id;
}

/** One delivery attempt. Returns "retry" with a delay when it should be retried. */
export async function attemptDelivery(deliveryId: string): Promise<{ result: "success" | "failed" | "retry"; delayMs?: number }> {
  const db = getDb();
  const d = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(deliveryId) as Delivery | undefined;
  if (!d) return { result: "failed" };
  const hook = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(d.webhook_id) as Row | undefined;
  if (!hook) return { result: "failed" };
  const attempt = d.attempts + 1;
  const started = Date.now();
  let status: number | null = null;
  let body = "";
  let error: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "User-Agent": "FormForge-Webhooks/1.0", "X-FormForge-Event": d.event,
        "X-FormForge-Delivery": d.id, "X-FormForge-Attempt": String(attempt), "X-FormForge-Signature": signPayload(hook.secret, d.payload),
      },
      body: d.payload,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    status = res.status;
    body = (await res.text().catch(() => "")).slice(0, 2000);
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const ok = status !== null && status >= 200 && status < 300;
  const retry = !ok && attempt < MAX_ATTEMPTS;
  const delayMs = retry ? RETRY_DELAYS_S[attempt] * 1000 * retryScale() : undefined;
  db.prepare("UPDATE webhook_deliveries SET status = ?, attempts = ?, response_status = ?, response_body = ?, error = ?, duration_ms = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?")
    .run(ok ? "success" : retry ? "retrying" : "failed", attempt, status, body, error ?? (ok ? null : `HTTP ${status}`), Date.now() - started, retry ? new Date(Date.now() + delayMs!).toISOString() : null, now(), d.id);
  return { result: ok ? "success" : retry ? "retry" : "failed", delayMs };
}

export function listDeliveries(ws: string, opts: { webhookId?: string; formId?: string; limit?: number } = {}) {
  const where = ["workspace_id = ?"];
  const args: unknown[] = [ws];
  if (opts.webhookId) { where.push("webhook_id = ?"); args.push(opts.webhookId); }
  if (opts.formId) { where.push("form_id = ?"); args.push(opts.formId); }
  return getDb().prepare(`SELECT * FROM webhook_deliveries WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`).all(...args, opts.limit ?? 100) as Delivery[];
}
export function getDelivery(ws: string, id: string) {
  return getDb().prepare("SELECT * FROM webhook_deliveries WHERE id = ? AND workspace_id = ?").get(id, ws) as Delivery | undefined;
}
