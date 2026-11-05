import { requireSession } from "@/lib/session";
import { publicUrl } from "@/lib/enrich/pipeline";
import { googleAuthUrl, resolveAppConfig, makeOAuthState } from "@/lib/calendar";
import { NextResponse } from "next/server";

export async function GET() {
  const s = await requireSession();
  const cfg = resolveAppConfig(s.workspace.id, "google", publicUrl());
  if (!cfg) {
    return NextResponse.redirect(new URL("/dashboard/integrations?calendar=google&error=not_configured", publicUrl()));
  }
  const state = makeOAuthState({ workspaceId: s.workspace.id, userId: s.user.id, provider: "google", returnTo: "/dashboard/integrations" });
  return NextResponse.redirect(googleAuthUrl(cfg, state));
}
