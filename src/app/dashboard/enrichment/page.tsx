import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { HBarChart } from "@/components/app/charts";
import { listIntegrationsView } from "@/lib/integrations/store";
import { timeAgo } from "@/lib/format";
import { Sparkles } from "lucide-react";
export const metadata = { title: "Enrichment" };

const TONE: Record<string, "green" | "blue" | "red" | "gray" | "amber"> = { success: "green", cache_hit: "blue", error: "red", timeout: "red", skipped: "gray", no_data: "gray", pending: "amber" };

export default async function Enrichment() {
  const s = await requireSession();
  const db = getDb();
  const ws = s.workspace.id;
  const per = db.prepare(`SELECT provider, COUNT(*) total, SUM(status IN ('success','cache_hit')) hits, SUM(status='cache_hit') cached, SUM(status IN ('error','timeout')) errors, ROUND(AVG(CASE WHEN status='success' THEN duration_ms END)) avg_ms, SUM(credits) credits, SUM(cost_usd) cost FROM enrichment_logs WHERE workspace_id = ? GROUP BY provider ORDER BY provider`).all(ws) as { provider: string; total: number; hits: number; cached: number; errors: number; avg_ms: number | null; credits: number; cost: number }[];
  const logs = db.prepare("SELECT l.*, s.form_id FROM enrichment_logs l LEFT JOIN submissions s ON s.id = l.submission_id WHERE l.workspace_id = ? ORDER BY l.created_at DESC LIMIT 60").all(ws) as { id: string; submission_id: string | null; form_id: string | null; provider: string; status: string; duration_ms: number; credits: number; cost_usd: number; message: string | null; created_at: string }[];
  const research = db.prepare("SELECT * FROM research_tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10").all(ws) as { id: string; query: string; mode: string; status: string; created_at: string; submission_id: string | null }[];
  const totals = per.reduce((a, p) => ({ total: a.total + p.total, hits: a.hits + p.hits, credits: a.credits + p.credits, cost: a.cost + p.cost }), { total: 0, hits: 0, credits: 0, cost: 0 });
  const integ = listIntegrationsView(ws).filter((i) => i.fields.some((f) => f.required));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Enrichment" description="Every provider call with outcome, latency, credits and cost. Built-in providers run offline; external ones run when a key is configured." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Provider calls" value={totals.total} />
        <Stat label="Overall hit rate" value={totals.total ? `${Math.round((totals.hits / totals.total) * 100)}%` : "—"} />
        <Stat label="Credits used" value={totals.credits.toLocaleString()} hint="Apollo / Valyu credits" />
        <Stat label="Est. cost" value={`$${totals.cost.toFixed(3)}`} hint="AI tokens + Valyu" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Providers" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead className="bg-subtle text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><tr><th className="px-4 py-2 font-medium">Provider</th><th className="px-4 py-2 text-right font-medium">Calls</th><th className="px-4 py-2 text-right font-medium">Hit rate</th><th className="px-4 py-2 text-right font-medium">Cache hits</th><th className="px-4 py-2 text-right font-medium">Errors</th><th className="px-4 py-2 text-right font-medium">Avg latency</th></tr></thead>
              <tbody>{per.length ? per.map((p) => <tr key={p.provider} className="border-t border-line"><td className="px-4 py-2 font-medium text-fg">{p.provider}</td><td className="px-4 py-2 text-right tabular-nums">{p.total}</td><td className="px-4 py-2 text-right tabular-nums">{Math.round((p.hits / p.total) * 100)}%</td><td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{p.cached}</td><td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{p.errors}</td><td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{p.avg_ms != null ? `${p.avg_ms} ms` : "—"}</td></tr>) : <tr><td colSpan={6}><EmptyState icon={<Sparkles size={16} />} title="No enrichment yet" description="Submit a form to see provider calls here." /></td></tr>}</tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Hit rate by provider" />
          <div className="p-3">{per.length ? <HBarChart data={per.map((p) => ({ name: p.provider, value: Math.round((p.hits / p.total) * 100) }))} valueLabel="Hit rate" unit="%" /> : <EmptyState title="No data" />}</div>
          <div className="border-t border-line p-4"><p className="mb-2 text-[12px] font-medium text-fg-subtle">External providers</p><div className="flex flex-wrap gap-1.5">{integ.map((i) => <Link key={i.id} href={`/dashboard/integrations#${i.id}`}><Badge tone={i.enabled ? "green" : "gray"} dot>{i.label}: {i.enabled ? "enabled" : "disabled (no key)"}</Badge></Link>)}</div></div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent calls" />
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead className="sticky top-0 bg-subtle text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="px-4 py-1.5 font-medium">When</th><th className="px-4 py-1.5 font-medium">Provider</th><th className="px-4 py-1.5 font-medium">Outcome</th><th className="px-4 py-1.5 text-right font-medium">ms</th><th className="px-4 py-1.5 font-medium">Detail</th></tr></thead>
              <tbody>{logs.map((l) => <tr key={l.id} className="border-t border-line"><td className="whitespace-nowrap px-4 py-1.5 text-fg-subtle">{timeAgo(l.created_at)}</td><td className="px-4 py-1.5 text-fg">{l.provider}</td><td className="px-4 py-1.5"><Badge tone={TONE[l.status] ?? "gray"}>{l.status}</Badge></td><td className="px-4 py-1.5 text-right tabular-nums text-fg-subtle">{l.duration_ms}</td><td className="max-w-[280px] truncate px-4 py-1.5 text-fg-subtle" title={l.message ?? ""}>{l.submission_id && l.form_id ? <Link href={`/dashboard/forms/${l.form_id}?s=${l.submission_id}`} className="text-accent hover:underline">open</Link> : null} {l.message}</td></tr>)}</tbody>
            </table>
            {!logs.length && <EmptyState title="No calls yet" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="DeepResearch tasks" description="Valyu async research jobs" />
          <ul className="divide-y divide-line">{research.length ? research.map((r) => <li key={r.id} className="px-4 py-2.5 text-[12.5px]"><div className="flex items-center gap-2"><Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge><Badge>{r.mode}</Badge><span className="text-fg-subtle">{timeAgo(r.created_at)}</span></div><p className="mt-1 line-clamp-2 text-fg-muted">{r.query}</p></li>) : <li className="px-4 py-6 text-center text-[12.5px] text-fg-subtle">No research tasks. Enable Valyu DeepResearch on a form.</li>}</ul>
        </Card>
      </div>
    </div>
  );
}
