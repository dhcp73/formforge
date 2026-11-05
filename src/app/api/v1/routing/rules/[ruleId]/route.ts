import { apiRoute, optionsHandler, readJson, notFound } from "@/lib/api";
import { updateRule, deleteRule, getRule } from "@/lib/routing";
export const dynamic = "force-dynamic";
export const PATCH = apiRoute("automations:write", async ({ auth, params, req }) => {
  if (!getRule(auth.workspaceId, params.ruleId)) notFound("Rule");
  const b = await readJson(req);
  const patch: Record<string, unknown> = { ...b };
  if ("form_id" in b) patch.formId = b.form_id;
  if ("stop_on_match" in b) patch.stopOnMatch = b.stop_on_match;
  return updateRule(auth.workspaceId, params.ruleId, patch);
});
export const DELETE = apiRoute("automations:write", async ({ auth, params }) => { if (!deleteRule(auth.workspaceId, params.ruleId)) notFound("Rule"); return { deleted: true, id: params.ruleId }; });
export const OPTIONS = optionsHandler;
