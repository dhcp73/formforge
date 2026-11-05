"use client";
import * as React from "react";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Badge, Textarea } from "@/components/ui/primitives";
import { SHOW_IF_OPS, type ShowIfOp } from "@/lib/ingest/logic";
import { Switch, Modal } from "@/components/ui/overlay";
import { FIELD_TYPES, type FieldDef } from "@/lib/types";

export function TzOffsetInput() {
  const [v, setV] = React.useState("Z");
  React.useEffect(() => {
    const m = -new Date().getTimezoneOffset();
    const sign = m >= 0 ? "+" : "-"; const a = Math.abs(m);
    setV(`${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`);
  }, []);
  return <input type="hidden" name="tzOffset" value={v} />;
}

export function LocalDateTime({ name, iso, id, ...rest }: { name: string; iso: string | null; id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) {
  const [v, setV] = React.useState("");
  React.useEffect(() => {
    if (!iso) return;
    const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
    setV(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
  }, [iso]);
  return <Input type="datetime-local" id={id} name={name} value={v} onChange={(e) => setV(e.target.value)} {...rest} />;
}

export function ToggleRow({ name, label, description, defaultChecked, badge, disabled }: { name: string; label: string; description: string; defaultChecked: boolean; badge?: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">{label}{badge}</div><p className="mt-0.5 text-[12.5px] text-fg-subtle">{description}</p></div>
      <Switch name={name} label={label} defaultChecked={defaultChecked} disabled={disabled} />
    </div>
  );
}

export function DeepResearchMode({ defaultMode, credits }: { defaultMode: string; credits: Record<string, number> }) {
  const [m, setM] = React.useState(defaultMode);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="deepResearchMode" className="text-[12.5px] font-medium text-fg">DeepResearch mode</label>
      <Select id="deepResearchMode" name="deepResearchMode" value={m} onChange={(e) => setM(e.target.value)} className="w-auto">
        {Object.keys(credits).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
      </Select>
      <span className="text-[12.5px] text-fg-subtle" data-testid="research-cost">Estimated cost: <b className="text-fg">~{credits[m]} credits</b> per submission</span>
    </div>
  );
}

type Row = FieldDef & { _k: string };
const SHOW_IF_LABELS: Record<ShowIfOp, string> = { eq: "equals", neq: "does not equal", in: "is one of (a,b)", not_in: "is not one of", contains: "contains", gt: "greater than", lt: "less than", filled: "is filled", empty: "is empty" };

export function FieldsEditor({ initial }: { initial: FieldDef[] }) {
  const [rows, setRows] = React.useState<Row[]>(() => initial.map((f, i) => ({ ...f, _k: `${i}-${f.name}` })));
  const [adv, setAdv] = React.useState<number | null>(null);
  const update = (i: number, patch: Partial<FieldDef>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const serial = JSON.stringify(rows.map(({ _k, ...f }) => { void _k; return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v !== undefined)); }));
  const cur = adv != null ? rows[adv] : null;
  return (
    <div>
      <input type="hidden" name="fields" value={serial} />
      {rows.length === 0 ? <p className="rounded-md border border-dashed border-line p-4 text-center text-[12.5px] text-fg-subtle">No schema — every field is accepted as-is and types are detected automatically.</p> : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead className="bg-subtle text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="w-8" /><th className="px-2 py-1.5 font-medium">Name</th><th className="px-2 py-1.5 font-medium">Label</th><th className="px-2 py-1.5 font-medium">Type</th><th className="px-2 py-1.5 font-medium">Required</th><th className="px-2 py-1.5" /></tr></thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f._k} className="border-t border-line">
                  <td className="px-1 text-fg-subtle"><div className="flex flex-col"><button type="button" aria-label={`Move ${f.name || "field"} up`} onClick={() => move(i, -1)} className="hover:text-fg"><ChevronUp size={12} /></button><GripVertical size={12} className="hidden" /><button type="button" aria-label={`Move ${f.name || "field"} down`} onClick={() => move(i, 1)} className="hover:text-fg"><ChevronDown size={12} /></button></div></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Field ${i + 1} name`} value={f.name} onChange={(e) => update(i, { name: e.target.value.replace(/\s+/g, "_") })} placeholder="email" className="font-mono" /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`Field ${i + 1} label`} value={f.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Work email" /></td>
                  <td className="px-2 py-1.5"><Select aria-label={`Field ${i + 1} type`} value={f.type} onChange={(e) => update(i, { type: e.target.value as FieldDef["type"] })}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></td>
                  <td className="px-2 py-1.5"><Switch label={`Field ${i + 1} required`} checked={f.required} onCheckedChange={(v) => update(i, { required: v })} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAdv(i)}>Rules{(f.pattern || f.minLength || f.maxLength || f.renameTo || f.options?.length) && <Badge tone="indigo">on</Badge>}{f.showIf && <Badge tone="amber">logic</Badge>}</Button>
                    <Button size="icon" variant="ghost" aria-label={`Remove field ${f.name || i + 1}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button size="sm" className="mt-2" onClick={() => setRows((r) => [...r, { name: "", type: "text", required: false, _k: `n${Date.now()}` }])}><Plus size={13} />Add field</Button>
      <Modal open={adv != null} onOpenChange={(o) => !o && setAdv(null)} title={`Validation rules${cur?.name ? ` · ${cur.name}` : ""}`} description="Optional constraints applied when schema mode is Validate or Strict.">
        {cur && adv != null && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-[12.5px] font-medium text-fg">Min length<Input type="number" min={0} value={cur.minLength ?? ""} onChange={(e) => update(adv, { minLength: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} /></label>
              <label className="space-y-1 text-[12.5px] font-medium text-fg">Max length<Input type="number" min={1} value={cur.maxLength ?? ""} onChange={(e) => update(adv, { maxLength: e.target.value === "" ? undefined : Math.max(1, Number(e.target.value)) })} /></label>
            </div>
            <label className="block space-y-1 text-[12.5px] font-medium text-fg">Regex pattern<Input value={cur.pattern ?? ""} onChange={(e) => update(adv, { pattern: e.target.value || undefined })} placeholder="^[A-Z]{2}\d{4}$" className="font-mono" /></label>
            <label className="block space-y-1 text-[12.5px] font-medium text-fg">Pattern error message<Input value={cur.patternMessage ?? ""} onChange={(e) => update(adv, { patternMessage: e.target.value || undefined })} placeholder="Use the format AB1234" /></label>
            {cur.type === "select" && (
              <label className="block space-y-1 text-[12.5px] font-medium text-fg">Options (one per line)
                <Textarea rows={3} value={(cur.options ?? []).join("\n")} onChange={(e) => update(adv, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })} placeholder={"Sales\nSupport\nPartnership"} />
              </label>
            )}
            <fieldset className="space-y-2 rounded-md border border-line p-3">
              <legend className="px-1 text-[12px] font-semibold text-fg">Branching logic</legend>
              <p className="text-[12px] text-fg-subtle">Only show, validate and store this field when another field matches.</p>
              <div className="grid grid-cols-3 gap-2">
                <Select aria-label="Show if field" value={cur.showIf?.field ?? ""} onChange={(e) => update(adv, { showIf: e.target.value ? { field: e.target.value, op: cur.showIf?.op ?? "eq", value: cur.showIf?.value } : undefined })}>
                  <option value="">Always show</option>
                  {rows.filter((r, j) => j !== adv && r.name).map((r) => <option key={r._k} value={r.name}>{r.name}</option>)}
                </Select>
                <Select aria-label="Show if operator" disabled={!cur.showIf} value={cur.showIf?.op ?? "eq"} onChange={(e) => cur.showIf && update(adv, { showIf: { ...cur.showIf, op: e.target.value as ShowIfOp } })}>
                  {SHOW_IF_OPS.map((o) => <option key={o} value={o}>{SHOW_IF_LABELS[o]}</option>)}
                </Select>
                <Input aria-label="Show if value" disabled={!cur.showIf || cur.showIf.op === "filled" || cur.showIf.op === "empty"} value={cur.showIf?.value == null ? "" : String(cur.showIf.value)} onChange={(e) => cur.showIf && update(adv, { showIf: { ...cur.showIf, value: e.target.value } })} placeholder="Sales" />
              </div>
            </fieldset>
            <label className="block space-y-1 text-[12.5px] font-medium text-fg">Store as (rename)<Input value={cur.renameTo ?? ""} onChange={(e) => update(adv, { renameTo: e.target.value || undefined })} placeholder="work_email" className="font-mono" /></label>
            <div className="flex justify-end"><Button variant="primary" onClick={() => setAdv(null)}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function DangerZone({ name, onDelete }: { name: string; onDelete: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 size={13} />Delete form</Button>
      <Modal open={open} onOpenChange={setOpen} title="Delete this form?" description="All submissions, files, webhooks and schedules for this form are deleted permanently.">
        <label htmlFor="confirm-name" className="text-[12.5px] text-fg">Type <b>{name}</b> to confirm</label>
        <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5" autoFocus />
        <div className="mt-4 flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={typed !== name || pending} onClick={() => start(() => onDelete())}>{pending ? "Deleting…" : "Delete form"}</Button></div>
      </Modal>
    </>
  );
}
