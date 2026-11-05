import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/enrich/pipeline";
import { exchangeMicrosoftCode, parseOAuthState, resolveAppConfig, upsertConnection } from "@/lib/calendar";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = publicUrl();
  if (err || !code || !state) {
    return NextResponse.redirect(new URL(`/dashboard/integrations?calendar=microsoft&error=${encodeURIComponent(err || "missing_code")}`, base));
  }
  try {
    const st = parseOAuthState(state);
    const cfg = resolveAppConfig(st.workspaceId, "microsoft", base);
    if (!cfg) throw new Error("Microsoft OAuth is not configured");
    const tokens = await exchangeMicrosoftCode(cfg, code);
    const email = tokens.email || "microsoft-user";
    upsertConnection({
      workspaceId: st.workspaceId, userId: st.userId, provider: "microsoft",
      accountEmail: email, tokens, scopes: tokens.scope,
    });
    return NextResponse.redirect(new URL(st.returnTo || "/dashboard/integrations?calendar=microsoft&connected=1", base));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(new URL(`/dashboard/integrations?calendar=microsoft&error=${encodeURIComponent(msg)}`, base));
  }
}
