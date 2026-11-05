import { apiRoute, optionsHandler } from "@/lib/api";
import { svc } from "@/lib/service";
import { queryFromUrl } from "@/lib/query";
export const dynamic = "force-dynamic";
export const GET = apiRoute("submissions:read", async ({ auth, params, url }) => svc.listSubmissions(auth.workspaceId, { ...queryFromUrl(url), formId: params.formId }));
export const OPTIONS = optionsHandler;
