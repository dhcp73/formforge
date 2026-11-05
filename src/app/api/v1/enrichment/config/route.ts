import { apiRoute, optionsHandler } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("forms:read", async ({ auth }) => ({ providers: svc.enrichmentConfig(auth.workspaceId), waterfall: ["apollo", "clay", "valyu", "offline", "ipgeo", "ai"] }));
export const OPTIONS = optionsHandler;
