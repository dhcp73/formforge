import { apiRoute, optionsHandler, readJson } from "@/lib/api";
import { listRules, createRule } from "@/lib/routing";
export const dynamic = "force-dynamic";
const toInput = (b: Record<string, unknown>) => ({ ...b, formId: b.form_id ?? b.formId, stopOnMatch: b.stop_on_match ?? b.stopOnMatch });
export const GET = apiRoute("automations:read", async ({ auth }) => ({ data: listRules(auth.workspaceId) }));
export const POST = apiRoute("automations:write", async ({ auth, req }) => Response.json(createRule(auth.workspaceId, toInput(await readJson(req))), { status: 201 }));
export const OPTIONS = optionsHandler;
