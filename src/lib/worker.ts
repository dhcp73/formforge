import { spawn } from "node:child_process";
import { registerJob, drainJobs, recoverStale, enqueueJob } from "./jobs";
import { processSubmission } from "./processing";
import { attemptDelivery } from "./webhooks";
import { runSchedule, dueSchedules } from "./schedules";
import { pollResearch } from "./enrich/pipeline";
import { runMonitorOnce } from "./monitor";
import { kvSet, kvGet } from "./kv";
import { now, getDb } from "./db";
import { newId } from "./ids";
import { CronExpressionParser } from "cron-parser";

let registered = false;
export function registerHandlers() {
  if (registered) return;
  registered = true;
  registerJob("submission.process", async (p) => { await processSubmission(String(p.submissionId)); });
  registerJob("webhook.deliver", async (p) => {
    const r = await attemptDelivery(String(p.deliveryId));
    if (r.result === "retry") return { retryInMs: r.delayMs ?? 0 };
  });
  registerJob("routing.webhook", async (p) => {
    const res = await fetch(String(p.url), { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "FormForge-Routing/1.0" }, body: JSON.stringify(p.payload), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Routing webhook responded ${res.status}`);
  });
  registerJob("schedule.run", async (p) => ({ result: await runSchedule(String(p.scheduleId)) }));
  registerJob("research.poll", async (p) => {
    const r = await pollResearch(String(p.taskId));
    if (r === "pending") return { retryInMs: 60_000 };
  });
  registerJob("qa.run", async (p) => { await runQaAgent(String(p.runId ?? "")); });
}

/** Spawns the Playwright UI agent against this server; results land in qa_runs. */
export function runQaAgent(runId: string): Promise<void> {
  const id = runId || newId("qa");
  if (!runId) getDb().prepare("INSERT INTO qa_runs (id, status, started_at) VALUES (?, 'running', ?)").run(id, now());
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/ui-agent.ts", "--run-id", id, "--quick"], { cwd: process.cwd(), env: { ...process.env }, stdio: "ignore" });
    child.on("exit", () => resolve());
    child.on("error", () => { getDb().prepare("UPDATE qa_runs SET status = 'failed', finished_at = ? WHERE id = ?").run(now(), id); resolve(); });
  });
}

const g = globalThis as unknown as { __ffWorker?: boolean; __ffMonitorBusy?: boolean };

export function startWorker(opts: { monitor?: boolean } = {}) {
  if (g.__ffWorker) return;
  g.__ffWorker = true;
  registerHandlers();
  recoverStale();
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      kvSet("worker_heartbeat", now());
      for (const id of dueSchedules()) enqueueJob("schedule.run", { scheduleId: id });
      kvSet("scheduler_heartbeat", now());
      const qaCron = process.env.FORMFORGE_QA_CRON;
      if (qaCron) {
        const next = kvGet("qa_next_run");
        if (!next) kvSet("qa_next_run", CronExpressionParser.parse(qaCron).next().toDate().toISOString());
        else if (next <= now()) { enqueueJob("qa.run", {}); kvSet("qa_next_run", CronExpressionParser.parse(qaCron).next().toDate().toISOString()); }
      }
      await drainJobs(25);
    } catch (e) { console.error("[worker]", e); }
    finally { busy = false; }
  }, Number(process.env.FORMFORGE_WORKER_INTERVAL_MS || 1000));
  if (opts.monitor !== false && process.env.FORMFORGE_MONITOR !== "off") {
    const interval = Number(process.env.FORMFORGE_MONITOR_INTERVAL_MS || 60_000);
    const tick = async () => {
      if (g.__ffMonitorBusy) return;
      g.__ffMonitorBusy = true;
      try { await runMonitorOnce(); } catch (e) { console.error("[monitor]", e); } finally { g.__ffMonitorBusy = false; }
    };
    setTimeout(tick, 8000);
    setInterval(tick, interval);
  }
  console.log("[formforge] worker, scheduler and monitor started");
}
