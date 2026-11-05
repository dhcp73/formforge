import { apiRoute } from "@/lib/api";
import { fileResponse } from "@/lib/files";
export const dynamic = "force-dynamic";
export const GET = apiRoute("submissions:read", async ({ auth, params }) => fileResponse(auth.workspaceId, params.submissionId, params.index));
