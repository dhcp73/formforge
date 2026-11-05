/** Standalone worker: job queue + scheduler + health monitor. Use when running the web app with FORMFORGE_INLINE_WORKER=0. */
import { startWorker } from "@/lib/worker";
console.log(`[worker] starting (pid ${process.pid})`);
startWorker();
process.on("SIGTERM", () => { console.log("[worker] stopping"); process.exit(0); });
process.on("SIGINT", () => process.exit(0));
