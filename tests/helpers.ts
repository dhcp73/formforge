import { createUser } from "@/lib/auth";
import { createForm } from "@/lib/forms";
import { createApiKey } from "@/lib/apikeys";
import { SCOPES, type Scope, type FormSettings } from "@/lib/types";
import { POST as formPost } from "@/app/api/f/[formId]/route";
import { resetRateLimits } from "@/lib/ingest/ratelimit";

let n = 0;
export function workspace(name = "Test") {
  n++;
  const { userId, workspaceId } = createUser({ email: `user${n}-${Date.now()}@example.com`, name: `${name} User`, password: "password123", workspaceName: `${name} WS ${n}` });
  return { userId, ws: workspaceId };
}
export function form(ws: string, settings: Partial<FormSettings> = {}, name = "Contact") { return createForm(ws, { name, settings }); }
export function apiKey(ws: string, scopes: Scope[] = [...SCOPES]) { return createApiKey(ws, "test", scopes).key; }

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
let ipN = 0;
export const nextIp = () => `81.2.69.${(ipN++ % 250) + 1}`;

export async function submit(formId: string, body: BodyInit | Record<string, unknown>, opts: { headers?: Record<string, string>; json?: boolean; ip?: string } = {}) {
  const isObj = body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof URLSearchParams);
  const headers: Record<string, string> = { "user-agent": UA, "x-forwarded-for": opts.ip ?? nextIp(), ...(opts.json !== false ? { accept: "application/json" } : {}), ...(isObj ? { "content-type": "application/json" } : {}), ...opts.headers };
  const req = new Request(`http://formforge.test/api/f/${formId}`, { method: "POST", headers, body: isObj ? JSON.stringify(body) : (body as BodyInit) });
  const res = await formPost(req, { params: Promise.resolve({ formId }) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* redirect */ }
  return { res, json, status: res.status };
}

/** Invoke a Next route handler module export with a Request. */
export async function call(handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>, url: string, init: RequestInit & { key?: string; params?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.key) headers.set("authorization", `Bearer ${init.key}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await handler(new Request(`http://formforge.test${url}`, { ...init, headers }), { params: Promise.resolve(init.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json: json as Record<string, any>, headers: res.headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export { resetRateLimits };
