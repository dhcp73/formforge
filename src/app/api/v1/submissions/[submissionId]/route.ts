import { apiRoute, optionsHandler, readJson } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("submissions:read", async ({ auth, params }) => svc.getSubmission(auth.workspaceId, params.submissionId));
export const PATCH = apiRoute("submissions:write", async ({ auth, params, req }) => svc.updateSubmission(auth.workspaceId, params.submissionId, (await readJson(req)) as never));
export const DELETE = apiRoute("submissions:write", async ({ auth, params }) => svc.deleteSubmission(auth.workspaceId, params.submissionId));
export const OPTIONS = optionsHandler;
