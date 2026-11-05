import { apiRoute, optionsHandler } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("submissions:read", async ({ auth }) => svc.stats(auth.workspaceId));
export const OPTIONS = optionsHandler;
