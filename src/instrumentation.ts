export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const mode = (process.env.STORAGE_MODE || "sqlite").toLowerCase();
  // Vercel / ephemeral modes rely on /api/cron/drain instead of a long-lived worker.
  if (mode === "browser" || mode === "memory" || process.env.FORMFORGE_INLINE_WORKER === "0") return;
  const { startWorker } = await import("./lib/worker");
  startWorker();
}
