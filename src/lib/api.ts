import { ZodError } from "zod";
import { extractKey, verifyApiKey, hasScope, type ApiKeyAuth } from "./apikeys";
import type { Scope } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "error", public details?: unknown) { super(message); }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
};

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status, headers: CORS });
  if (e instanceof ZodError) {
    const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return Response.json({ error: { code: "validation_failed", message: details.map((d) => `${d.path || "body"}: ${d.message}`).join("; "), details } }, { status: 422, headers: CORS });
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/not found/i.test(msg)) return Response.json({ error: { code: "not_found", message: msg } }, { status: 404, headers: CORS });
  if (e instanceof Error && /required|invalid|must|select at least/i.test(msg)) return Response.json({ error: { code: "bad_request", message: msg } }, { status: 400, headers: CORS });
  console.error("[api]", e);
  return Response.json({ error: { code: "internal_error", message: "Internal server error" } }, { status: 500, headers: CORS });
}

type Params = Record<string, string>;
export type ApiHandler = (ctx: { req: Request; auth: ApiKeyAuth; params: Params; url: URL }) => Promise<unknown>;

/** Wrap a /api/v1 handler with API-key auth + scope check + JSON/error handling. */
export function apiRoute(scope: Scope | null, handler: ApiHandler) {
  return async (req: Request, ctx: { params: Promise<Params> }) => {
    try {
      const auth = verifyApiKey(extractKey(req.headers));
      if (!auth) throw new ApiError(401, "Missing or invalid API key. Send `Authorization: Bearer ff_live_…`.", "unauthorized");
      if (scope && !hasScope(auth, scope)) throw new ApiError(403, `API key is missing the "${scope}" scope.`, "insufficient_scope");
      const params = (await ctx?.params) ?? {};
      const result = await handler({ req, auth, params, url: new URL(req.url) });
      if (result instanceof Response) {
        for (const [k, v] of Object.entries(CORS)) result.headers.set(k, v);
        return result;
      }
      return Response.json(result ?? { ok: true }, { headers: CORS });
    } catch (e) { return errorResponse(e); }
  };
}

export const optionsHandler = () => new Response(null, { status: 204, headers: CORS });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch { throw new ApiError(400, "Request body must be a JSON object", "invalid_json"); }
}

export function notFound(what = "Resource"): never { throw new ApiError(404, `${what} not found`, "not_found"); }
