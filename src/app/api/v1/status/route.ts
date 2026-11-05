import { apiRoute, optionsHandler } from "@/lib/api";
import { statusSummary } from "@/lib/monitor";
export const dynamic = "force-dynamic";
export const GET = apiRoute(null, async () => {
  const s = statusSummary();
  return { status: s.status, last_run: s.lastRun, components: s.components.map((c) => ({ id: c.id, label: c.label, group: c.group, status: c.status, latency_ms: c.latencyMs, message: c.message, uptime_24h: c.uptime24, uptime_90d: c.uptime90, checked_at: c.checkedAt })), incidents: s.incidents };
});
export const OPTIONS = optionsHandler;
