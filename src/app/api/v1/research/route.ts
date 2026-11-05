import { apiRoute, optionsHandler, readJson } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = apiRoute("submissions:write", async ({ auth, req }) => svc.researchCompany(auth.workspaceId, (await readJson(req)) as never));
export const OPTIONS = optionsHandler;
