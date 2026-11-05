import Link from "next/link";
import { ArrowUpRight, Inbox, ShieldAlert, Target, FileText, Sparkles, Plus } from "lucide-react";
import { requireSession } from "@/lib/session";
import { workspaceStats, listSubmissions } from "@/lib/submissions";
import { listForms } from "@/lib/forms";
import { Card, CardHeader, PageHeader, Stat, EmptyState, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { SubmissionsChart, HBarChart } from "@/components/app/charts";
import { countryName } from "@/lib/enrich/local";
import { timeAgo, displayName } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const st = workspaceStats(s.workspace.id, 30);
  const forms = listForms(s.workspace.id);
  const recent = listSubmissions(s.workspace.id, { limit: 6 }).data;
  const formName = new Map(forms.map((f) => [f.id, f.name]));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={`Good to see you, ${s.user.name.split(" ")[0]}`} description="Here's what's happening across your forms in the last 30 days."
        actions={<><ButtonLink href="/dashboard/leads">View leads</ButtonLink><ButtonLink href="/dashboard/forms?new=1" variant="primary"><Plus size={14} />New form</ButtonLink></>} />
      {sp.welcome && forms.length === 0 && (
        <Card className="mb-5 border-accent/30 bg-accent-soft/60 p-4">
          <p className="text-[13.5px] font-semibold text-fg">Welcome to FormForge 👋</p>
          <p className="mt-1 text-[13px] text-fg-muted">Create your first form, then paste the endpoint into any HTML form. Connect Apollo, Clay, Valyu or an LLM under Integrations to enrich leads.</p>
          <div className="mt-3 flex flex-wrap gap-2"><ButtonLink href="/dashboard/forms?new=1" variant="primary" size="sm">Create a form</ButtonLink><ButtonLink href="/docs/quickstart" size="sm">Read quickstart</ButtonLink></div>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Submissions (all time)" value={st.total - st.spam} icon={<Inbox size={15} />} hint={`${st.last7} in the last 7 days`} />
        <Stat label="Spam rate" value={`${st.spamRate}%`} icon={<ShieldAlert size={15} />} hint={`${st.spam} blocked or flagged`} />
        <Stat label="Average fit score" value={st.avgFit ?? "—"} icon={<Target size={15} />} hint="Across enriched leads" />
        <Stat label="Active forms" value={st.forms} icon={<FileText size={15} />} hint={<Link href="/dashboard/forms" className="hover:text-fg">Manage forms →</Link>} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Submissions over time" description="Legitimate submissions vs. spam, last 30 days" />
          <div className="p-3">{st.total ? <SubmissionsChart data={st.series} /> : <EmptyState icon={<Inbox size={16} />} title="No submissions yet" description="Send a test submission from a form's Setup tab." />}</div>
        </Card>
        <Card>
          <CardHeader title="Routing distribution" description="Leads per owner / rep" actions={<ButtonLink href="/dashboard/routing" size="sm" variant="ghost">Rules <ArrowUpRight size={13} /></ButtonLink>} />
          <div className="p-3">{st.owners.length ? <HBarChart data={st.owners.map((o) => ({ name: o.owner, value: o.count }))} valueLabel="Leads" /> : <EmptyState title="No routed leads" description="Create routing rules to assign leads to reps." />}</div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Enrichment hit rate" description="Successful lookups per provider" actions={<ButtonLink href="/dashboard/enrichment" size="sm" variant="ghost">Details <ArrowUpRight size={13} /></ButtonLink>} />
          <div className="p-3">{st.providers.length ? <HBarChart data={st.providers.map((p) => ({ name: p.provider, value: p.hitRate }))} valueLabel="Hit rate" unit="%" /> : <EmptyState icon={<Sparkles size={16} />} title="No enrichment calls yet" />}</div>
        </Card>
        <Card>
          <CardHeader title="Top countries" description="From IP geolocation" />
          <ul className="divide-y divide-line">
            {st.countries.length ? st.countries.map((c) => (
              <li key={c.c} className="flex items-center justify-between px-4 py-2.5 text-[13px]"><span className="text-fg">{countryName(c.c)}</span><span className="tabular-nums text-fg-subtle">{c.n}</span></li>
            )) : <li><EmptyState title="No geo data yet" /></li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Latest submissions" actions={<ButtonLink href="/dashboard/leads" size="sm" variant="ghost">All <ArrowUpRight size={13} /></ButtonLink>} />
          <ul className="divide-y divide-line">
            {recent.length ? recent.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/forms/${r.formId}?s=${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-subtle">
                  <div className="min-w-0"><div className="truncate text-[13px] font-medium text-fg">{displayName(r)}</div><div className="truncate text-[12px] text-fg-subtle">{formName.get(r.formId)} · {timeAgo(r.createdAt)}</div></div>
                  {r.fitScore != null && <Badge tone={r.fitScore >= 75 ? "green" : r.fitScore >= 50 ? "amber" : "gray"}>{r.fitScore}</Badge>}
                </Link>
              </li>
            )) : <li><EmptyState title="Nothing yet" description="Submissions show up here in real time." /></li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
