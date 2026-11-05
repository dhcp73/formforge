import { apiRoute, optionsHandler, readJson, notFound } from "@/lib/api";
import { getForm } from "@/lib/forms";
import { createSchedule, listSchedules, pubSchedule } from "@/lib/schedules";
export const dynamic = "force-dynamic";
export const GET = apiRoute("automations:read", async ({ auth, params }) => {
  if (!getForm(auth.workspaceId, params.formId)) notFound("Form");
  return { data: listSchedules(auth.workspaceId, params.formId).map(pubSchedule) };
});
export const POST = apiRoute("automations:write", async ({ auth, params, req }) => {
  if (!getForm(auth.workspaceId, params.formId)) notFound("Form");
  return Response.json(pubSchedule(createSchedule(auth.workspaceId, params.formId, await readJson(req))), { status: 201 });
});
export const OPTIONS = optionsHandler;
