import { Badge, type Tone } from "@/components/ui/primitives";
import type { statusSummary } from "@/lib/monitor";
import { cn } from "@/lib/cn";

type Summary = ReturnType<typeof statusSummary>;
const TONE: Record<string, Tone> = { ok: "green", degraded: "amber", down: "red", disabled: "gray", none: "gray" };
const LABEL: Record<string, string> = { ok: "Operational", degraded: "Degraded", down: "Down", disabled: "Disabled", none: "Pending" };
const BAR: Record<string, string> = { ok: "bg-emerald-500", degraded: "bg-amber-400", down: "bg-red-500", none: "bg-muted" };

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className={cn("h-6 w-24", className)} aria-hidden="true" />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 96},${22 - (v / max) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 96 24" className={cn("h-6 w-24", className)} role="img" aria-label={`Latency trend, max ${max} ms`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusBoard({ summary, compact = false }: { summary: Summary; compact?: boolean }) {
  const groups = Array.from(new Set(summary.components.map((c) => c.group)));
  const overall = summary.status;
  return (
    <div className="space-y-6">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4", overall === "ok" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : overall === "degraded" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30")}>
        <div className="flex items-center gap-3">
          <span className={cn("h-3 w-3 rounded-full", overall === "ok" ? "bg-emerald-500" : overall === "degraded" ? "bg-amber-400" : "bg-red-500")} />
          <span className="text-[15px] font-semibold text-fg">{overall === "ok" ? "All systems operational" : overall === "degraded" ? "Some systems degraded" : "Partial outage"}</span>
        </div>
        <span className="text-[12.5px] text-fg-subtle">{summary.lastRun ? `Last checked ${new Date(summary.lastRun).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "medium" })} (UK)` : "Waiting for first check…"}</span>
      </div>
      {groups.map((g) => (
        <section key={g} className="overflow-hidden rounded-xl border border-line bg-panel">
          <h2 className="border-b border-line bg-subtle px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{g}</h2>
          <ul>
            {summary.components.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-fg">{c.label}</div>
                    <div className="truncate text-[12px] text-fg-subtle">{c.message}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!compact && <Sparkline values={c.sparkline} className="hidden sm:block" />}
                    <span className="hidden w-16 text-right text-[12px] tabular-nums text-fg-subtle sm:inline">{c.latencyMs != null ? `${c.latencyMs} ms` : "—"}</span>
                    <Badge tone={TONE[c.status]} dot>{LABEL[c.status]}</Badge>
                  </div>
                </div>
                {!compact && c.status !== "disabled" && (
                  <div className="mt-2.5">
                    <div className="flex h-6 items-end gap-[2px]" role="img" aria-label={`${c.label} 90-day uptime ${c.uptime90 ?? "n/a"}%`}>
                      {c.bars.map((b) => <span key={b.date} title={`${b.date}: ${b.uptime == null ? "no data" : `${b.uptime}% uptime`}`} className={cn("h-full min-w-0 flex-1 rounded-[1px]", BAR[b.status])} />)}
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-fg-subtle"><span>90 days ago</span><span>{c.uptime90 != null ? `${c.uptime90}% uptime` : "No data"}</span><span>Today</span></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="rounded-xl border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 text-[13.5px] font-semibold text-fg">Incident history</h2>
        {summary.incidents.length === 0 ? <p className="px-4 py-6 text-[13px] text-fg-subtle">No incidents recorded.</p> : (
          <ul>
            {summary.incidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0"><div className="text-[13.5px] font-medium text-fg">{i.title}</div><div className="text-[12px] text-fg-subtle">{i.last_message}</div></div>
                <div className="text-right text-[12px] text-fg-subtle">
                  <Badge tone={i.status === "open" ? "red" : "green"}>{i.status === "open" ? "Ongoing" : "Resolved"}</Badge>
                  <div className="mt-1">{new Date(i.started_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}{i.resolved_at ? ` → ${new Date(i.resolved_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London" })}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
