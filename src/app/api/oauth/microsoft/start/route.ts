import { requireSession } from "@/lib/session";
import { publicUrl } from "@/lib/enrich/pipeline";
import { microsoftAuthUrl, resolveAppConfig, makeOAuthState } from "@/lib/calendar";
import { NextResponse } from "next/server";

export async function GET() {
  const s = await requireSession();
  const cfg = resolveAppConfig(s.workspace.id, "microsoft", publicUrl());
  if (!cfg) {
    return NextResponse.redirect(new URL("/dashboard/integrations?calendar=microsoft&error=not_configured", publicUrl()));
  }
  const state = makeOAuthState({ workspaceId: s.workspace.id, userId: s.user.id, provider: "microsoft", returnTo: "/dashboard/integrations" });
  return NextResponse.redirect(microsoftAuthUrl(cfg, state));
}
