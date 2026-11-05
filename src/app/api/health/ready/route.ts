import { statusSummary } from "@/lib/monitor";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
/** Readiness: DB reachable + latest monitor result per component. 503 when any component is down. */
export function GET() {
  try { getDb().prepare("SELECT 1").get(); } catch (e) {
    return Response.json({ status: "down", components: { database: { status: "down", message: String(e) } } }, { status: 503 });
  }
  const s = statusSummary();
  const components = Object.fromEntries(s.components.map((c) => [c.id, { status: c.status === "none" ? "pending" : c.status, latency_ms: c.latencyMs, message: c.message, checked_at: c.checkedAt }]));
  return Response.json({ status: s.status, last_run: s.lastRun, components }, { status: s.status === "down" ? 503 : 200 });
}
