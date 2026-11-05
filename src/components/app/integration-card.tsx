"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, PlugZap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, Input, Select, Textarea, Badge, Label } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { ActionForm, Field, FormMessage, SubmitButton, type ActionState } from "@/components/ui/action-form";
import { CopyButton } from "@/components/ui/copy";
import type { IntegrationField } from "@/lib/integrations/registry";
import { cn } from "@/lib/cn";

export interface IntegrationView {
  id: string; label: string; category: string; description: string; docs: string; fields: IntegrationField[]; enabled: boolean; configured: boolean; source: string | null;
  values: Record<string, string | boolean>; lastTestedAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null;
}

const MONO: Record<string, string> = { apollo: "A", clay: "C", valyu: "V", openai: "O", openrouter: "R", ai: "AI" };
const COLOR: Record<string, string> = { apollo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300", clay: "bg-amber-500/10 text-amber-700 dark:text-amber-300", valyu: "bg-violet-500/10 text-violet-600 dark:text-violet-300", openai: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", openrouter: "bg-sky-500/10 text-sky-700 dark:text-sky-300", ai: "bg-zinc-500/10 text-fg-muted" };

export function IntegrationCard({ v, save, test, extra }: { v: IntegrationView; save: (s: ActionState, fd: FormData) => Promise<ActionState>; test: () => Promise<ActionState>; extra?: React.ReactNode }) {
  const router = useRouter();
  const [testRes, setTestRes] = React.useState<ActionState>(null);
  const [pending, start] = React.useTransition();
  const hasKey = v.fields.some((f) => f.required);
  const status = !hasKey ? <Badge tone="gray">Settings</Badge> : v.enabled ? <Badge tone="green" dot>Enabled</Badge> : v.configured ? <Badge tone="amber" dot>Configured · off</Badge> : <Badge dot>Disabled · no key</Badge>;
  return (
    <Card id={v.id} className="scroll-mt-20 flex flex-col overflow-hidden" data-testid={`integration-${v.id}`}>
      <div className="flex min-w-0 items-start gap-3 overflow-hidden border-b border-line p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold", COLOR[v.id])} aria-hidden>{MONO[v.id]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold text-fg">{v.label}</h2>{status}<Badge>{v.category}</Badge>{v.source === "env" && <Badge tone="blue">from env</Badge>}</div>
          <p className="mt-1 text-[12.5px] text-fg-subtle">{v.description}</p>
        </div>
      </div>
      <ActionForm action={save} className="flex flex-1 flex-col gap-3 p-4" onDone={() => router.refresh()}>
        <FormMessage />
        {v.fields.map((f) => {
          const val = v.values[f.key];
          const hint = [f.help, f.env && `Env override: ${f.env}`].filter(Boolean).join(" · ") || undefined;
          if (f.type === "boolean") return <label key={f.key} className="flex items-center gap-2 text-[13px] text-fg"><Switch name={f.key} label={f.label} defaultChecked={val === true || (val === "" && f.default === true)} />{f.label}</label>;
          if (f.type === "select") return <Field key={f.key} name={f.key} label={f.label} hint={hint}><Select defaultValue={String(val || f.default || "")}>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>;
          if (f.type === "textarea") return <Field key={f.key} name={f.key} label={f.label} hint={hint}><Textarea rows={3} defaultValue={String(val || f.default || "")} /></Field>;
          if (f.type === "secret") return <Field key={f.key} name={f.key} label={f.label} hint={(val ? "Stored encrypted. Leave blank to keep the current value. " : "") + (hint ?? "")}><Input type="password" autoComplete="off" placeholder={String(val || f.placeholder || (f.generated ? "Auto-generated on save" : ""))} /></Field>;
          return <Field key={f.key} name={f.key} label={f.label} hint={hint}><Input defaultValue={String(val || "")} placeholder={String(f.default ?? f.placeholder ?? "")} /></Field>;
        })}
        {extra}
        {hasKey && <label className="flex items-center gap-2 text-[13px] text-fg"><Switch name="enabled" label={`Enable ${v.label}`} defaultChecked={v.enabled || (!v.configured)} />Enable {v.label} when a key is present</label>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <SubmitButton size="sm" pendingText="Saving…">Save</SubmitButton>
          {hasKey && <Button size="sm" disabled={pending} onClick={() => start(async () => { setTestRes(await test()); router.refresh(); })} data-testid={`test-${v.id}`}>{pending ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}Test connection</Button>}
          <Link href={v.docs} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-fg-subtle hover:text-fg"><BookOpen size={13} />Docs</Link>
        </div>
        {(testRes || v.lastTestedAt) && (
          <p role="status" className={cn("flex items-start gap-1.5 text-[12px]", (testRes ? !testRes.error : v.lastTestOk) ? "text-emerald-600" : "text-red-600")}>
            {(testRes ? !testRes.error : v.lastTestOk) ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <XCircle size={13} className="mt-px shrink-0" />}
            {testRes ? testRes.error ?? testRes.message : `Last test: ${v.lastTestMessage}`}
          </p>
        )}
      </ActionForm>
    </Card>
  );
}

export function UrlRow({ label, url }: { label: string; url: string }) {
  return <div className="min-w-0"><Label>{label}</Label><div className="mt-1 flex min-w-0 items-center gap-1"><code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-[11.5px] text-fg-muted">{url}</code><CopyButton value={url} label={`Copy ${label}`} /></div></div>;
}
