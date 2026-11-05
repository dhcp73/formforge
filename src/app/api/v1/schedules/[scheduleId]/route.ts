import { apiRoute, optionsHandler, readJson, notFound } from "@/lib/api";
import { updateSchedule, deleteSchedule, getSchedule, pubSchedule } from "@/lib/schedules";
export const dynamic = "force-dynamic";
export const PATCH = apiRoute("automations:write", async ({ auth, params, req }) => {
  if (!getSchedule(auth.workspaceId, params.scheduleId)) notFound("Schedule");
  return pubSchedule(updateSchedule(auth.workspaceId, params.scheduleId, await readJson(req)));
});
export const DELETE = apiRoute("automations:write", async ({ auth, params }) => { if (!deleteSchedule(auth.workspaceId, params.scheduleId)) notFound("Schedule"); return { deleted: true, id: params.scheduleId }; });
export const OPTIONS = optionsHandler;
