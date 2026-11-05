import { getDb, now, parseJson } from "./db";
import { newId } from "./ids";

/** DB-backed job queue (SQLite). Survives restarts; claimed atomically with UPDATE … RETURNING. */
export interface Job { id: string; type: string; payload: Record<string, unknown>; attempts: number }
export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void | { retryInMs?: number; result?: unknown }>;

const handlers = new Map<string, JobHandler>();
export function registerJob(type: string, handler: JobHandler) { handlers.set(type, handler); }

export function enqueueJob(type: string, payload: Record<string, unknown> = {}, delayMs = 0): string {
  const id = newId("job");
  const ts = now();
  getDb().prepare("INSERT INTO jobs (id, type, payload, status, run_at, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?, ?)")
    .run(id, type, JSON.stringify(payload), new Date(Date.now() + delayMs).toISOString(), ts, ts);
  return id;
}

function claim(): Job | null {
  const db = getDb();
  const r = db.prepare(
    `UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at LIMIT 1) RETURNING id, type, payload, attempts`,
  ).get(now(), now(), now()) as { id: string; type: string; payload: string; attempts: number } | undefined;
  return r ? { id: r.id, type: r.type, payload: parseJson(r.payload, {}), attempts: r.attempts } : null;
}

export async function runJob(job: Job) {
  const db = getDb();
  const h = handlers.get(job.type);
  if (!h) { db.prepare("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").run(`No handler for ${job.type}`, now(), job.id); return; }
  try {
    const res = await h(job.payload, job);
    if (res && res.retryInMs !== undefined) {
      db.prepare("UPDATE jobs SET status = 'queued', run_at = ?, locked_at = NULL, updated_at = ? WHERE id = ?").run(new Date(Date.now() + res.retryInMs).toISOString(), now(), job.id);
    } else {
      db.prepare("UPDATE jobs SET status = 'done', result = ?, updated_at = ? WHERE id = ?").run(res?.result ? JSON.stringify(res.result).slice(0, 4000) : null, now(), job.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (job.attempts < 3) db.prepare("UPDATE jobs SET status = 'queued', run_at = ?, locked_at = NULL, last_error = ?, updated_at = ? WHERE id = ?").run(new Date(Date.now() + 5000 * job.attempts).toISOString(), msg, now(), job.id);
    else db.prepare("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").run(msg, now(), job.id);
  }
}

/** Process up to `max` due jobs. Returns how many ran. */
export async function drainJobs(max = 25): Promise<number> {
  let n = 0;
  for (; n < max; n++) {
    const job = claim();
    if (!job) break;
    await runJob(job);
  }
  return n;
}

/** Re-queue jobs stuck in running (crash recovery). */
export function recoverStale(ms = 5 * 60_000) {
  getDb().prepare("UPDATE jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < ?").run(new Date(Date.now() - ms).toISOString());
}

export function queueStats() {
  return getDb().prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all() as { status: string; n: number }[];
}

export function recentJobs(limit = 50) {
  return getDb().prepare("SELECT id, type, status, attempts, run_at, last_error, created_at, updated_at FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit) as {
    id: string; type: string; status: string; attempts: number; run_at: string; last_error: string | null; created_at: string; updated_at: string;
  }[];
}
