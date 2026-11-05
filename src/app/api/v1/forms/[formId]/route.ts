import { apiRoute, optionsHandler, readJson } from "@/lib/api";
import { svc } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = apiRoute("forms:read", async ({ auth, params }) => svc.getForm(auth.workspaceId, params.formId));
export const PATCH = apiRoute("forms:write", async ({ auth, params, req }) => svc.updateForm(auth.workspaceId, params.formId, await readJson(req)));
export const DELETE = apiRoute("forms:write", async ({ auth, params }) => svc.deleteForm(auth.workspaceId, params.formId));
export const OPTIONS = optionsHandler;
