import { apiRoute, optionsHandler, notFound } from "@/lib/api";
import { getSchedule, runSchedule } from "@/lib/schedules";
export const dynamic = "force-dynamic";
export const POST = apiRoute("automations:write", async ({ auth, params }) => {
  if (!getSchedule(auth.workspaceId, params.scheduleId)) notFound("Schedule");
  return runSchedule(params.scheduleId);
});
export const OPTIONS = optionsHandler;
