import { Download } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listSchedules, listExports } from "@/lib/schedules";
import { listForms } from "@/lib/forms";
import { queueStats } from "@/lib/jobs";
import { kvGet } from "@/lib/kv";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ScheduleList } from "@/components/app/automation-lists";
import { timeAgo } from "@/lib/format";
export const metadata = { title: "Schedules" };

export default async function Schedules() {
  const s = await requireSession();
  const forms = new Map(listForms(s.workspace.id).map((f) => [f.id, f.name]));
  const items = listSchedules(s.workspace.id);
  const exports = listExports(s.workspace.id);
  const q = Object.fromEntries(queueStats().map((r) => [r.status, r.n]));
  const hb = kvGet("worker_heartbeat");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Schedules" description="Cron-driven digests, batch webhooks and CSV exports, executed by the background job runner. Open/close windows live in each form's settings." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active schedules" value={items.filter((i) => i.active).length} />
        <Stat label="Jobs queued" value={(q.queued ?? 0) + (q.running ?? 0)} />
        <Stat label="Jobs failed" value={q.failed ?? 0} />
        <Stat label="Worker heartbeat" value={hb ? timeAgo(hb) : "—"} hint={hb && Date.now() - new Date(hb).getTime() < 30000 ? <Badge tone="green" dot>Healthy</Badge> : <Badge tone="amber" dot>Stale</Badge>} />
      </div>
      <Card className="mb-4"><CardHeader title="All schedules" description="Create schedules from a form's Automations tab." /><ScheduleList items={items} formNames={forms} /></Card>
      <Card>
        <CardHeader title="Exports" description="CSV files written by scheduled exports." />
        {exports.length ? <ul className="divide-y divide-line">{exports.map((e) => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12.5px]"><span className="font-mono text-fg">{e.filename}</span><span className="text-fg-subtle">{forms.get(e.form_id)} · {e.row_count} rows · {timeAgo(e.created_at)}</span><a href={`/api/app/exports/${e.id}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Download size={13} />Download</a></li>)}</ul> : <EmptyState title="No exports yet" description="Create a CSV export schedule and click Run now." />}
      </Card>
    </div>
  );
}
