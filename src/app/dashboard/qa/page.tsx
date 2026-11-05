import { Bot, FileText } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getDb, parseJson } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ActionButton } from "@/components/app/action-button";
import { ButtonLink } from "@/components/ui/button";
import { runQaAction } from "@/app/dashboard/actions";
import { fmtDate } from "@/lib/format";
import { CodeBlock } from "@/components/ui/copy";
export const metadata = { title: "UI QA agent" };
export const dynamic = "force-dynamic";

type Summary = { pages?: number; routes?: number; viewports?: string[]; themes?: string[]; issues?: number; errors?: number; warnings?: number; passed?: boolean; durationMs?: number; aiReview?: string; checks?: Record<string, number>; mode?: string };

export default async function Qa() {
  await requireSession();
  const runs = (getDb().prepare("SELECT * FROM qa_runs ORDER BY started_at DESC LIMIT 25").all() as { id: string; status: string; summary: string; report_path: string | null; started_at: string; finished_at: string | null }[]).map((r) => ({ ...r, s: parseJson<Summary>(r.summary, {}) }));
  const last = runs.find((r) => r.status === "passed" || r.status === "failed");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="UI QA agent" description="An autonomous Playwright crawler that visits every route across viewports and themes, follows every internal link and checks console errors, failed requests, overflow, overlap, accessibility (axe) and dead links. Results feed the status page."
        actions={<>{last?.report_path && <ButtonLink href="/api/app/qa/report/index.html" target="_blank"><FileText size={13} />Latest report</ButtonLink>}<ActionButton variant="primary" action={runQaAction}><Bot size={14} />Run quick audit</ActionButton></>} />
      {last && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Last result" value={last.status === "passed" ? "Passed" : "Failed"} hint={fmtDate(last.finished_at)} />
          <Stat label="Page renders checked" value={last.s.pages ?? 0} hint={`${last.s.routes ?? 0} routes · ${(last.s.viewports ?? []).length} viewports · ${(last.s.themes ?? []).length} themes`} />
          <Stat label="Errors / warnings" value={`${last.s.errors ?? 0} / ${last.s.warnings ?? 0}`} />
          <Stat label="Duration" value={last.s.durationMs ? `${Math.round(last.s.durationMs / 1000)}s` : "—"} hint={last.s.mode} />
        </div>
      )}
      <Card>
        <CardHeader title="Runs" description="Full audits run from the CLI; quick audits can be started here or scheduled with FORMFORGE_QA_CRON." />
        {runs.length ? (
          <ul className="divide-y divide-line">{runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]">
              <Badge tone={r.status === "passed" ? "green" : r.status === "failed" ? "red" : "amber"} dot>{r.status}</Badge>
              <span className="text-fg">{fmtDate(r.started_at)}</span>
              <span className="text-fg-subtle">{r.s.mode ?? ""} · {r.s.pages ?? 0} renders · {r.s.errors ?? 0} errors · {r.s.warnings ?? 0} warnings</span>
              {r.s.aiReview === "on" && <Badge tone="violet">AI review</Badge>}
            </li>
          ))}</ul>
        ) : <EmptyState icon={<Bot size={16} />} title="No QA runs yet" description="Run a quick audit, or `npm run agent:ui` for the full matrix." />}
      </Card>
      <Card className="mt-4"><CardHeader title="Run from the command line" /><div className="p-3"><CodeBlock lang="bash" code={`npm run agent:ui            # full: every route × 4 viewports × light/dark\nnpm run agent:ui -- --quick # laptop light + mobile dark\nopen reports/ui-agent/index.html`} /></div></Card>
    </div>
  );
}
