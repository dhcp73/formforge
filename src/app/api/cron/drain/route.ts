/**
 * Vercel Cron / on-demand worker substitute: drain due jobs + enqueue due schedules + one monitor tick.
 * Secured by CRON_SECRET (Authorization: Bearer …) when set.
 */
import { drainJobs, recoverStale, enqueueJob } from "@/lib/jobs";
import { dueSchedules } from "@/lib/schedules";
import { runMonitorOnce } from "@/lib/monitor";
import { registerHandlers } from "@/lib/worker";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  registerHandlers();
  recoverStale();
  const due = dueSchedules();
  for (const id of due) enqueueJob("schedule.run", { scheduleId: id });
  const jobs = await drainJobs(50);
  await runMonitorOnce().catch(() => null);
  return Response.json({ ok: true, jobs, schedulesEnqueued: due.length });
}

export const POST = GET;
