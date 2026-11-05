import { apiRoute, optionsHandler } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = apiRoute("submissions:write", async ({ auth, params }) => svc.enrichSubmission(auth.workspaceId, params.submissionId));
export const OPTIONS = optionsHandler;
