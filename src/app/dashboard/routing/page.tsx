import { GitBranch, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listRules, ROUTABLE_FIELDS } from "@/lib/routing";
import { listForms } from "@/lib/forms";
import { workspaceStats } from "@/lib/submissions";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { RuleBuilder } from "@/components/app/rule-builder";
import { ActionButton, ActionSwitch } from "@/components/app/action-button";
import { toggleRuleAction, deleteRuleAction } from "@/app/dashboard/actions";
import { HBarChart } from "@/components/app/charts";
export const metadata = { title: "Routing" };

const OPL: Record<string, string> = { eq: "=", neq: "≠", contains: "contains", not_contains: "not contains", gt: ">", gte: "≥", lt: "<", lte: "≤", in: "in", not_in: "not in", exists: "is known", not_exists: "is unknown", ends_with: "ends with", matches: "~" };

export default async function Routing() {
  const s = await requireSession();
  const rules = listRules(s.workspace.id);
  const forms = listForms(s.workspace.id).map((f) => ({ id: f.id, name: f.name }));
  const fname = new Map(forms.map((f) => [f.id, f.name]));
  const owners = workspaceStats(s.workspace.id, 30).owners;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Lead routing" description="Assign owners, tag and notify based on answers and enrichment (Apollo, Clay, Valyu, AI, geo). Re-runs when late enrichment arrives." actions={<RuleBuilder forms={forms} fields={ROUTABLE_FIELDS} />} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`${rules.length} rule${rules.length === 1 ? "" : "s"}`} description="Evaluated in priority order (lowest first)." />
          {rules.length === 0 ? <EmptyState icon={<GitBranch size={16} />} title="No routing rules" description="Example: company.employees ≥ 200 AND geo.country in GB, DE → assign to the EMEA AE team." /> : (
            <ol className="divide-y divide-line">
              {rules.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-muted px-1.5 font-mono text-[11px] text-fg-subtle">P{r.priority}</span><span className="text-[13.5px] font-medium text-fg">{r.name}</span><Badge>{r.formId ? fname.get(r.formId) ?? "Form" : "All forms"}</Badge><span className="text-[12px] text-fg-subtle">{r.hitCount} matches</span></div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px]">
                        <span className="text-fg-subtle">If {r.match}:</span>
                        {r.conditions.map((c, i) => <code key={i} className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11.5px] text-fg-muted">{c.field} {OPL[c.op]} {Array.isArray(c.value) ? c.value.join(", ") : c.value == null ? "" : String(c.value)}</code>)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[12px] text-fg-subtle">
                        Then: {r.actions.assignTo.length ? <Badge tone="indigo">assign {r.actions.assignTo.map((o) => (r.actions.weights[o] !== undefined && r.actions.weights[o] !== 1 ? `${o}×${r.actions.weights[o]}` : o)).join(" / ")}</Badge> : null}{r.actions.tags.map((t) => <Badge key={t}>#{t}</Badge>)}{r.actions.notifyEmails.length ? <Badge tone="blue">notify {r.actions.notifyEmails.length}</Badge> : null}{r.actions.webhookUrl ? <Badge tone="violet">webhook</Badge> : null}{r.actions.markSpam ? <Badge tone="red">mark spam</Badge> : null}{r.actions.sticky ? <Badge tone="green">sticky owner</Badge> : null}{r.actions.bookingUrl || Object.keys(r.actions.ownerBookingUrls).length ? <Badge tone="blue">booking link</Badge> : null}{r.stopOnMatch ? <span>· stop</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ActionSwitch checked={r.active} label={`Toggle rule ${r.name}`} action={toggleRuleAction.bind(null, r.id)} />
                      <RuleBuilder forms={forms} fields={ROUTABLE_FIELDS} rule={{ id: r.id, name: r.name, formId: r.formId, priority: r.priority, match: r.match, conditions: r.conditions, actions: r.actions, stopOnMatch: r.stopOnMatch, active: r.active }} />
                      <ActionButton size="icon" variant="ghost" aria-label={`Delete rule ${r.name}`} action={deleteRuleAction.bind(null, r.id)} confirm={{ title: "Delete rule?", description: "Existing assignments are kept." }} confirmText="Delete" showResult={false}><Trash2 size={13} /></ActionButton>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <CardHeader title="Leads per owner" description="Last 30 days, excluding spam" />
          <div className="p-3">{owners.length ? <HBarChart data={owners.map((o) => ({ name: o.owner, value: o.count }))} valueLabel="Leads" /> : <EmptyState title="No leads yet" />}</div>
        </Card>
      </div>
    </div>
  );
}
