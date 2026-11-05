"use client";
import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input, Textarea, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { FieldDef } from "@/lib/types";
import { isFieldVisible } from "@/lib/ingest/logic";

export function HostedForm({ formId, fields, honeypot }: { formId: string; fields: FieldDef[]; honeypot: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const visible = (name: string) => isFieldVisible(name, fields, values);
  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement;
    if (t.name && t.type !== "file") setValues((v) => ({ ...v, [t.name]: t.value }));
  };
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!visible(f.name)) continue;
      const v = fd.get(f.name);
      const str = typeof v === "string" ? v.trim() : v instanceof File ? (v.size ? "file" : "") : "";
      if (f.required && !str) errs[f.name] = `${f.label ?? f.name} is required`;
      else if (str && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) errs[f.name] = "Enter a valid email address";
      else if (str && f.type === "url" && !/^https?:\/\/.+\..+/.test(str)) errs[f.name] = "Enter a full URL (https://…)";
      else if (str && f.minLength && str.length < f.minLength) errs[f.name] = `At least ${f.minLength} characters`;
      else if (str && f.maxLength && str.length > f.maxLength) errs[f.name] = `At most ${f.maxLength} characters`;
      else if (str && f.type === "number" && Number.isNaN(Number(str))) errs[f.name] = "Enter a number";
      else if (str && f.pattern) { try { if (!new RegExp(f.pattern).test(str)) errs[f.name] = f.patternMessage ?? "Invalid format"; } catch { /* ignore bad regex */ } }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending"); setMsg(null);
    try {
      const r = await fetch(`/api/f/${formId}`, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setState("done");
      else { setState("idle"); setMsg(j.message ?? "Something went wrong."); if (j.errors && typeof j.errors === "object") setErrors(j.errors); }
    } catch { setState("idle"); setMsg("Network error — please try again."); }
  };
  if (state === "done") return <div className="flex flex-col items-center py-10 text-center" role="status"><CheckCircle2 size={36} className="text-emerald-500" /><p className="mt-3 text-[16px] font-semibold text-fg">Thanks — we got it!</p><p className="mt-1 text-[13px] text-fg-subtle">Your submission was received.</p></div>;
  return (
    <form action={`/api/f/${formId}`} method="POST" encType="multipart/form-data" onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-4">
      {msg && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{msg}</p>}
      {fields.filter((f) => visible(f.name)).map((f) => {
        const id = `hf-${f.name}`;
        const common = { id, name: f.name, "aria-invalid": errors[f.name] ? true : undefined, "aria-describedby": errors[f.name] ? `${id}-err` : undefined, required: f.required };
        const label = `${f.label ?? f.name}${f.required ? " *" : ""}`;
        let input: React.ReactNode;
        if (f.type === "longtext") input = <Textarea rows={4} {...common} />;
        else if (f.type === "select") input = <Select {...common} defaultValue=""><option value="">Choose…</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>;
        else if (f.type === "boolean") input = <Select {...common}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></Select>;
        else if (f.type === "file") input = <input type="file" {...common} className="block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-subtle file:px-3 file:py-1.5 file:text-[12.5px] file:text-fg" />;
        else input = <Input type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "url" ? "url" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"} {...common} />;
        return <div key={f.name} className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{input}{errors[f.name] && <p id={`${id}-err`} className="text-[12px] text-red-600">{errors[f.name]}</p>}</div>;
      })}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}><label htmlFor="hf-hp">Leave empty</label><input id="hf-hp" type="text" name={honeypot} tabIndex={-1} autoComplete="off" /></div>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={state === "sending"}>{state === "sending" && <Loader2 size={14} className="animate-spin" />}Submit</Button>
    </form>
  );
}
