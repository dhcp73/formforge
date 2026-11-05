"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/primitives";
import { saveRuleAction } from "@/app/dashboard/actions";

const OPS: [string, string][] = [["eq", "equals"], ["neq", "does not equal"], ["contains", "contains"], ["not_contains", "does not contain"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["in", "is one of"], ["not_in", "is not one of"], ["exists", "is known"], ["not_exists", "is unknown"], ["ends_with", "ends with"], ["matches", "matches regex"]];
type Cond = { field: string; op: string; value?: unknown };
export type RuleDraft = { id?: string; name: string; formId: string | null; priority: number; match: "all" | "any"; conditions: Cond[]; actions: { assignTo: string[]; tags: string[]; notifyEmails: string[]; webhookUrl: string; markSpam: boolean }; stopOnMatch: boolean; active: boolean };

const blank: RuleDraft = { name: "", formId: null, priority: 100, match: "all", conditions: [{ field: "company.employees", op: "gte", value: 200 }], actions: { assignTo: [], tags: [], notifyEmails: [], webhookUrl: "", markSpam: false }, stopOnMatch: true, active: true };
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));
function coerce(op: string, raw: string): unknown {
  if (op === "in" || op === "not_in") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (op === "exists" || op === "not_exists") return undefined;
  if (["gt", "gte", "lt", "lte"].includes(op)) return Number(raw);
  if (raw === "true" || raw === "false") return raw === "true";
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function RuleBuilder({ rule, forms, fields }: { rule?: RuleDraft; forms: { id: string; name: string }[]; fields: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState<RuleDraft>(rule ?? blank);
  const [raw, setRaw] = React.useState<string[]>((rule ?? blank).conditions.map((c) => show(c.value)));
  const [text, setText] = React.useState({ assignTo: show(d.actions.assignTo), tags: show(d.actions.tags), notifyEmails: show(d.actions.notifyEmails) });
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const reset = () => { const r = rule ?? blank; setD(r); setRaw(r.conditions.map((c) => show(c.value))); setText({ assignTo: show(r.actions.assignTo), tags: show(r.actions.tags), notifyEmails: show(r.actions.notifyEmails) }); setErr(null); };
  const setCond = (i: number, p: Partial<Cond>) => setD((x) => ({ ...x, conditions: x.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  const save = () => {
    if (!d.name.trim()) return setErr("Give the rule a name.");
    if (!d.conditions.length) return setErr("Add at least one condition.");
    for (const [i, c] of d.conditions.entries()) {
      if (!c.field.trim()) return setErr(`Condition ${i + 1}: choose a field.`);
      if (!["exists", "not_exists"].includes(c.op) && !raw[i]?.trim()) return setErr(`Condition ${i + 1}: enter a value.`);
      if (["gt", "gte", "lt", "lte"].includes(c.op) && Number.isNaN(Number(raw[i]))) return setErr(`Condition ${i + 1}: value must be a number.`);
      if (c.op === "matches") { try { new RegExp(raw[i]); } catch { return setErr(`Condition ${i + 1}: invalid regex.`); } }
    }
    const emails = split(text.notifyEmails);
    const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) return setErr(`"${bad}" is not a valid email.`);
    if (d.actions.webhookUrl && !/^https?:\/\/.+/.test(d.actions.webhookUrl)) return setErr("Webhook URL must start with http(s)://");
    const payload = { ...d, id: undefined, conditions: d.conditions.map((c, i) => ({ field: c.field.trim(), op: c.op, value: coerce(c.op, raw[i] ?? "") })), actions: { ...d.actions, assignTo: split(text.assignTo), tags: split(text.tags), notifyEmails: emails } };
    start(async () => {
      const r = await saveRuleAction(rule?.id ?? null, payload);
      if (r?.error) setErr(r.error); else { setOpen(false); router.refresh(); }
    });
  };
  return (
    <Modal open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }} className="max-w-2xl" title={rule ? "Edit routing rule" : "New routing rule"} description="Rules run top to bottom by priority on the merged enrichment. Multiple owners are assigned round-robin."
      trigger={rule ? <Button size="sm" variant="ghost" aria-label={`Edit rule ${rule.name}`}><Pencil size={13} />Edit</Button> : <Button variant="primary" data-testid="new-rule"><Plus size={14} />New rule</Button>}>
      <div className="space-y-4">
        {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_90px]">
          <div className="space-y-1.5"><Label htmlFor="rule-name">Name</Label><Input id="rule-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Enterprise → AE team" /></div>
          <div className="space-y-1.5"><Label htmlFor="rule-form">Applies to</Label><Select id="rule-form" value={d.formId ?? ""} onChange={(e) => setD({ ...d, formId: e.target.value || null })}><option value="">All forms</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label htmlFor="rule-priority">Priority</Label><Input id="rule-priority" type="number" value={d.priority} onChange={(e) => setD({ ...d, priority: Number(e.target.value) || 0 })} /></div>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-fg">When <Select aria-label="Match mode" value={d.match} onChange={(e) => setD({ ...d, match: e.target.value as "all" | "any" })} className="h-7 w-auto"><option value="all">all</option><option value="any">any</option></Select> of these match:</div>
          <datalist id="routable-fields">{fields.map((f) => <option key={f} value={f} />)}</datalist>
          <div className="space-y-2">
            {d.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_150px_1fr_auto]">
                <Input aria-label={`Condition ${i + 1} field`} list="routable-fields" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} className="font-mono text-[12px]" placeholder="company.employees" />
                <Select aria-label={`Condition ${i + 1} operator`} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} className="order-3 sm:order-none">{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                <Input aria-label={`Condition ${i + 1} value`} value={raw[i] ?? ""} disabled={["exists", "not_exists"].includes(c.op)} onChange={(e) => setRaw((r) => { const n = [...r]; n[i] = e.target.value; return n; })} placeholder={["in", "not_in"].includes(c.op) ? "GB, DE, FR" : "value"} className="order-4 sm:order-none" />
                <Button size="icon" variant="ghost" aria-label={`Remove condition ${i + 1}`} onClick={() => { setD({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }); setRaw((r) => r.filter((_, j) => j !== i)); }}><Trash2 size={13} /></Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setD({ ...d, conditions: [...d.conditions, { field: "", op: "eq" }] }); setRaw((r) => [...r, ""]); }}><Plus size={13} />Add condition</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="rule-assign">Assign to (round-robin)</Label><Input id="rule-assign" value={text.assignTo} onChange={(e) => setText({ ...text, assignTo: e.target.value })} placeholder="ava@acme.com, sam@acme.com" /></div>
          <div className="space-y-1.5"><Label htmlFor="rule-tags">Add tags</Label><Input id="rule-tags" value={text.tags} onChange={(e) => setText({ ...text, tags: e.target.value })} placeholder="enterprise, priority" /></div>
          <div className="space-y-1.5"><Label htmlFor="rule-notify">Notify</Label><Input id="rule-notify" value={text.notifyEmails} onChange={(e) => setText({ ...text, notifyEmails: e.target.value })} placeholder="ae-team@acme.com" /></div>
          <div className="space-y-1.5"><Label htmlFor="rule-webhook">Call webhook</Label><Input id="rule-webhook" value={d.actions.webhookUrl} onChange={(e) => setD({ ...d, actions: { ...d.actions, webhookUrl: e.target.value } })} placeholder="https://hooks.slack.com/…" /></div>
        </div>
        <div className="flex flex-wrap gap-4 text-[13px] text-fg">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.stopOnMatch} onChange={(e) => setD({ ...d, stopOnMatch: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--accent)]" />Stop after this rule matches</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.actions.markSpam} onChange={(e) => setD({ ...d, actions: { ...d.actions, markSpam: e.target.checked } })} className="h-3.5 w-3.5 accent-[var(--accent)]" />Mark as spam</label>
        </div>
        <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : rule ? "Save rule" : "Create rule"}</Button></div>
      </div>
    </Modal>
  );
}
