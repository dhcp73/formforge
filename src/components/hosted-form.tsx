"use client";
import * as React from "react";
import { CheckCircle2, Loader2, CalendarDays, ChevronRight, ChevronLeft } from "lucide-react";
import { Input, Textarea, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { FieldDef, FormSettings } from "@/lib/types";
import { evaluateLogic, isFieldVisible, type FormStep, type LogicRule } from "@/lib/ingest/logic";

type Props = {
  formId: string;
  fields: FieldDef[];
  honeypot: string;
  steps?: FormStep[];
  logic?: LogicRule[];
  /** When true, thank-you can fetch native booking slots for the assigned owner. */
  nativeBooking?: boolean;
};

export function HostedForm({ formId, fields, honeypot, steps = [], logic = [], nativeBooking = false }: Props) {
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "booking">("idle");
  const [booking, setBooking] = React.useState<string | null>(null);
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [owner, setOwner] = React.useState<string | null>(null);
  const [slots, setSlots] = React.useState<{ start: string; end: string }[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string | string[]>>({});
  const [stepIdx, setStepIdx] = React.useState(0);
  const [shown, setShown] = React.useState<string[]>([]);

  const dataForLogic = React.useMemo(() => ({ ...values, __shown: shown }), [values, shown]);
  const evaled = React.useMemo(
    () => evaluateLogic(fields, dataForLogic, { rules: logic, steps, currentStep: steps[stepIdx]?.id ?? null }),
    [fields, dataForLogic, logic, steps, stepIdx],
  );

  React.useEffect(() => {
    if (evaled.visible) {
      const extra = [...evaled.visible].filter((n) => fields.find((f) => f.name === n)?.hidden);
      if (extra.length) setShown((s) => Array.from(new Set([...s, ...extra])));
    }
  }, [evaled.visible, fields]);

  React.useEffect(() => {
    if (!steps.length || !evaled.step) return;
    const i = steps.findIndex((s) => s.id === evaled.step);
    if (i >= 0 && i !== stepIdx) setStepIdx(i);
  }, [evaled.step, steps, stepIdx]);

  const stepFields = React.useMemo(() => {
    if (!steps.length) return fields;
    const step = steps[stepIdx];
    if (!step) return fields;
    if (step.fields?.length) return fields.filter((f) => step.fields!.includes(f.name));
    // Infer: partition fields evenly / by order markers — use fields listed after previous steps
    const claimed = new Set(steps.flatMap((s, i) => (i < stepIdx ? (s.fields ?? []) : [])));
    if (steps.every((s) => s.fields?.length)) return fields.filter((f) => step.fields!.includes(f.name));
    // Fallback: show all visible fields when steps have no field lists
    return fields.filter((f) => !claimed.has(f.name));
  }, [fields, steps, stepIdx]);

  const visible = (name: string) => evaled.visible.has(name) || isFieldVisible(name, fields, dataForLogic);

  const setValue = (name: string, value: string | string[]) => setValues((v) => ({ ...v, [name]: value }));

  const validateVisible = (list: FieldDef[], fd?: FormData) => {
    const errs: Record<string, string> = {};
    for (const f of list) {
      if (!visible(f.name) || f.type === "hidden") continue;
      const fromFd = fd?.getAll(f.name);
      const raw = fromFd && fromFd.length ? (fromFd.length > 1 ? fromFd.map(String) : fromFd[0]) : values[f.name];
      const str = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.join(",") : raw instanceof File ? (raw.size ? "file" : "") : "";
      if (f.required && !str) errs[f.name] = `${f.label ?? f.name} is required`;
      else if (str && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) errs[f.name] = "Enter a valid email address";
      else if (str && f.type === "url" && !/^https?:\/\/.+\..+/.test(str)) errs[f.name] = "Enter a full URL (https://…)";
      else if (str && f.minLength && str.length < f.minLength) errs[f.name] = `At least ${f.minLength} characters`;
      else if (str && f.maxLength && str.length > f.maxLength) errs[f.name] = `At most ${f.maxLength} characters`;
      else if (str && (f.type === "number" || f.type === "rating") && Number.isNaN(Number(str))) errs[f.name] = "Enter a number";
      else if (str && f.pattern) { try { if (!new RegExp(f.pattern).test(str)) errs[f.name] = f.patternMessage ?? "Invalid format"; } catch { /* ignore */ } }
    }
    return errs;
  };

  const onChoice = (field: FieldDef, option: string) => {
    setValue(field.name, option);
    const jump = field.goto?.[option] ?? field.gotoStep;
    if (jump === "__end") {
      // mark ended — user still hits submit, or we auto-advance to last
      if (steps.length) setStepIdx(steps.length - 1);
    } else if (jump && steps.length) {
      const i = steps.findIndex((s) => s.id === jump);
      if (i >= 0) setStepIdx(i);
    }
  };

  const nextStep = () => {
    const errs = validateVisible(stepFields);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (evaled.ended) return;
    setStepIdx((i) => Math.min(i + 1, Math.max(steps.length - 1, 0)));
  };
  const prevStep = () => setStepIdx((i) => Math.max(i - 1, 0));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Merge controlled values (choice buttons may not be inputs)
    for (const [k, v] of Object.entries(values)) {
      if (fd.has(k)) continue;
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
      else fd.set(k, v);
    }
    const errs = validateVisible(fields.filter((f) => visible(f.name)), fd);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending"); setMsg(null);
    try {
      const r = await fetch(`/api/f/${formId}`, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setSubmissionId(typeof j.id === "string" ? j.id : null);
        setOwner(typeof j.owner === "string" ? j.owner : null);
        const book = typeof j.booking_url === "string" && /^https?:\/\//.test(j.booking_url) ? j.booking_url : null;
        setBooking(book);
        if (nativeBooking && j.id && (j.native_booking || j.owner)) {
          setState("booking");
          try {
            const sr = await fetch(`/api/v1/booking/slots?submissionId=${encodeURIComponent(j.id)}`);
            const sj = await sr.json().catch(() => ({}));
            if (sr.ok && Array.isArray(sj.slots) && sj.slots.length) {
              setSlots(sj.slots);
              setOwner(sj.owner ?? j.owner ?? null);
              return;
            }
          } catch { /* fall through to done */ }
        }
        setState("done");
      } else {
        setState("idle");
        setMsg(j.message ?? "Something went wrong.");
        if (j.errors && typeof j.errors === "object") setErrors(j.errors);
      }
    } catch { setState("idle"); setMsg("Network error — please try again."); }
  };

  const bookSlot = async (slot: { start: string; end: string }) => {
    if (!submissionId) return;
    setState("sending");
    try {
      const r = await fetch(`/api/v1/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ submissionId, start: slot.start, end: slot.end }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setBooking(typeof j.meet_url === "string" ? j.meet_url : booking);
        setState("done");
      } else {
        setMsg(j.error?.message ?? j.message ?? "Could not book that slot.");
        setState("booking");
      }
    } catch { setMsg("Network error booking the slot."); setState("booking"); }
  };

  if (state === "done") {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <CheckCircle2 size={36} className="text-emerald-500" />
        <p className="mt-3 text-[16px] font-semibold text-fg">Thanks — we got it!</p>
        <p className="mt-1 text-[13px] text-fg-subtle">Your submission was received.{owner ? ` You'll meet with ${owner.split("@")[0]}.` : ""}</p>
        {booking && (
          <a href={booking} target="_blank" rel="noopener noreferrer" data-testid="booking-link" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white hover:opacity-90">
            <CalendarDays size={15} aria-hidden />{booking.includes("meet") || booking.includes("teams") ? "Join meeting" : "Book a meeting now"}
          </a>
        )}
      </div>
    );
  }

  if (state === "booking" || (state === "sending" && slots.length)) {
    return (
      <div className="space-y-4" data-testid="native-booking">
        <div className="text-center">
          <CalendarDays className="mx-auto text-accent" size={28} />
          <p className="mt-2 text-[15px] font-semibold text-fg">Pick a time{owner ? ` with ${owner.split("@")[0]}` : ""}</p>
          <p className="text-[12.5px] text-fg-subtle">Times shown in your local timezone.</p>
        </div>
        {msg && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{msg}</p>}
        <ul className="space-y-2">
          {slots.map((s) => (
            <li key={s.start}>
              <button type="button" disabled={state === "sending"} onClick={() => bookSlot(s)} className="flex w-full items-center justify-between rounded-md border border-line bg-canvas px-3 py-2.5 text-left text-[13px] hover:border-accent hover:bg-subtle">
                <span>{new Date(s.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="text-fg-subtle">{Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000)} min</span>
              </button>
            </li>
          ))}
        </ul>
        {booking && (
          <a href={booking} target="_blank" rel="noopener noreferrer" className="block text-center text-[12.5px] text-accent underline">Prefer an external booking link</a>
        )}
        <Button variant="ghost" className="w-full" onClick={() => setState("done")}>Skip for now</Button>
      </div>
    );
  }

  const renderField = (f: FieldDef) => {
    if (!visible(f.name) || f.type === "hidden") {
      if (f.type === "hidden") return <input key={f.name} type="hidden" name={f.name} value={String(values[f.name] ?? "")} />;
      return null;
    }
    const id = `hf-${f.name}`;
    const common = { id, name: f.name, "aria-invalid": errors[f.name] ? true : undefined, "aria-describedby": errors[f.name] ? `${id}-err` : undefined, required: f.required };
    const label = `${f.label ?? f.name}${f.required ? " *" : ""}`;
    let input: React.ReactNode;

    if (f.type === "button") {
      input = (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={label}>
          {(f.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              data-testid={`choice-${f.name}-${o}`}
              onClick={() => onChoice(f, o)}
              className={`rounded-md border px-3 py-2.5 text-left text-[13px] font-medium transition ${values[f.name] === o ? "border-accent bg-accent/10 text-fg" : "border-line bg-canvas text-fg hover:border-accent/60"}`}
            >
              {o}
            </button>
          ))}
          {/* hidden input so FormData includes the choice */}
          <input type="hidden" name={f.name} value={String(values[f.name] ?? "")} />
        </div>
      );
    } else if (f.type === "radio") {
      input = (
        <div className="space-y-2" role="radiogroup" aria-label={label}>
          {(f.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-[13px] text-fg">
              <input type="radio" name={f.name} value={o} checked={values[f.name] === o} onChange={() => onChoice(f, o)} className="accent-[var(--accent)]" />
              {o}
            </label>
          ))}
        </div>
      );
    } else if (f.type === "checkbox" || f.type === "multiselect") {
      const selected = Array.isArray(values[f.name]) ? (values[f.name] as string[]) : [];
      input = (
        <div className="space-y-2" role="group" aria-label={label}>
          {(f.options ?? []).map((o) => {
            const on = selected.includes(o);
            return (
              <label key={o} className="flex items-center gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  name={f.name}
                  value={o}
                  checked={on}
                  onChange={() => setValue(f.name, on ? selected.filter((x) => x !== o) : [...selected, o])}
                  className="accent-[var(--accent)]"
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    } else if (f.type === "rating") {
      const max = f.maxRating ?? 5;
      const cur = Number(values[f.name] ?? 0);
      input = (
        <div className="flex gap-1" role="radiogroup" aria-label={label}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-label={`${n} of ${max}`} onClick={() => setValue(f.name, String(n))} className={`h-9 w-9 rounded-md border text-[13px] font-semibold ${cur >= n ? "border-accent bg-accent text-white" : "border-line bg-canvas text-fg"}`}>{n}</button>
          ))}
          <input type="hidden" name={f.name} value={String(values[f.name] ?? "")} />
        </div>
      );
    } else if (f.type === "longtext") input = <Textarea rows={4} {...common} value={String(values[f.name] ?? "")} onChange={(e) => setValue(f.name, e.target.value)} />;
    else if (f.type === "select") input = (
      <Select {...common} value={String(values[f.name] ?? "")} onChange={(e) => { setValue(f.name, e.target.value); const jump = f.goto?.[e.target.value] ?? f.gotoStep; if (jump && steps.length) { const i = steps.findIndex((s) => s.id === jump); if (i >= 0) setStepIdx(i); } }}>
        <option value="">Choose…</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
    else if (f.type === "boolean") input = (
      <Select {...common} value={String(values[f.name] ?? "")} onChange={(e) => setValue(f.name, e.target.value)}>
        <option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option>
      </Select>
    );
    else if (f.type === "file") input = <input type="file" {...common} className="block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-subtle file:px-3 file:py-1.5 file:text-[12.5px] file:text-fg" />;
    else input = (
      <Input
        type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "url" ? "url" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
        {...common}
        value={String(values[f.name] ?? "")}
        onChange={(e) => setValue(f.name, e.target.value)}
      />
    );

    return (
      <div key={f.name} className="space-y-1.5">
        {f.type !== "button" && <Label htmlFor={id}>{label}</Label>}
        {f.type === "button" && <p className="text-[13px] font-medium text-fg">{label}</p>}
        {input}
        {errors[f.name] && <p id={`${id}-err`} className="text-[12px] text-red-600">{errors[f.name]}</p>}
      </div>
    );
  };

  const isLast = !steps.length || stepIdx >= steps.length - 1 || evaled.ended;

  return (
    <form action={`/api/f/${formId}`} method="POST" encType="multipart/form-data" onSubmit={onSubmit} noValidate className="space-y-4">
      {msg && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{msg}</p>}
      {steps.length > 0 && (
        <div className="flex items-center justify-between text-[12px] text-fg-subtle">
          <span>Step {stepIdx + 1} of {steps.length}{steps[stepIdx]?.title ? ` · ${steps[stepIdx].title}` : ""}</span>
          <div className="flex gap-1">{steps.map((s, i) => <span key={s.id} className={`h-1.5 w-6 rounded-full ${i <= stepIdx ? "bg-accent" : "bg-line"}`} />)}</div>
        </div>
      )}
      {(steps.length ? stepFields : fields).map(renderField)}
      {/* Keep hidden-type fields and off-step values in the form */}
      {fields.filter((f) => f.type === "hidden" || (steps.length && !stepFields.includes(f) && values[f.name] != null)).map((f) => (
        f.type === "hidden" || !stepFields.includes(f) ? <input key={`keep-${f.name}`} type="hidden" name={f.name} value={Array.isArray(values[f.name]) ? (values[f.name] as string[]).join(",") : String(values[f.name] ?? "")} /> : null
      ))}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="hf-hp">Leave empty</label>
        <input id="hf-hp" type="text" name={honeypot} tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex gap-2">
        {steps.length > 0 && stepIdx > 0 && (
          <Button type="button" variant="ghost" onClick={prevStep}><ChevronLeft size={14} />Back</Button>
        )}
        {!isLast ? (
          <Button type="button" variant="primary" size="lg" className="flex-1" onClick={nextStep}>Continue <ChevronRight size={14} /></Button>
        ) : (
          <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={state === "sending"}>
            {state === "sending" && <Loader2 size={14} className="animate-spin" />}Submit
          </Button>
        )}
      </div>
    </form>
  );
}

/** Convenience: pass full settings from the server page. */
export function HostedFormFromSettings({ formId, settings }: { formId: string; settings: FormSettings }) {
  return (
    <HostedForm
      formId={formId}
      fields={settings.fields}
      honeypot={settings.honeypotField}
      steps={settings.steps}
      logic={settings.logic as LogicRule[]}
      nativeBooking
    />
  );
}
