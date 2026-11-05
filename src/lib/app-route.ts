import { getSession } from "./session";
import { errorResponse, ApiError } from "./api";
import type { SessionInfo } from "./auth";

/** Session-authenticated (cookie) route for dashboard downloads. */
export function sessionRoute<P>(handler: (s: SessionInfo, params: P, req: Request) => Response | Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const s = await getSession();
      if (!s) throw new ApiError(401, "Sign in required", "unauthorized");
      return await handler(s, await ctx.params, req);
    } catch (e) { return errorResponse(e); }
  };
}
