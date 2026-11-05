"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, KeyRound, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton, useActionResult, type ActionState } from "@/components/ui/action-form";
import { CopyButton } from "@/components/ui/copy";
import { createKeyAction, rotateKeyAction } from "@/app/dashboard/actions";

function RevealKey({ k }: { k: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-[12.5px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Copy this key now. For security it&apos;s stored hashed and won&apos;t be shown again.</div>
      <div className="flex items-center gap-1 rounded-md border border-line bg-subtle p-2"><code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-fg" data-testid="new-key">{k}</code><CopyButton value={k} label="Copy API key" /></div>
    </div>
  );
}

function CreateBody({ scopes, onClose }: { scopes: [string, string][]; onClose: () => void }) {
  const s = useActionResult();
  const key = s?.data?.key as string | undefined;
  if (key) return <><RevealKey k={key} /><div className="mt-4 flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div></>;
  return (
    <>
      <FormMessage />
      <Field name="name" label="Key name"><Input placeholder="Production website" autoFocus /></Field>
      <Field name="scopes" label="Scopes" hint="Grant only what the integration needs.">
        <fieldset className="grid gap-1.5 sm:grid-cols-2">
          {scopes.map(([sc, d]) => <label key={sc} className="flex items-start gap-2 rounded-md border border-line p-2 text-[12.5px]"><input type="checkbox" name="scopes" value={sc} defaultChecked={sc.endsWith(":read")} className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]" /><span><code className="font-mono text-fg">{sc}</code><span className="block text-fg-subtle">{d}</span></span></label>)}
        </fieldset>
      </Field>
      <Field name="expiresDays" label="Expiration"><Select defaultValue="0"><option value="0">Never</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></Select></Field>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><SubmitButton pendingText="Creating…">Create key</SubmitButton></div>
    </>
  );
}

export function CreateKey({ scopes }: { scopes: [string, string][] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [n, setN] = React.useState(0);
  React.useEffect(() => { if (sp.get("new") === "1") setOpen(true); }, [sp]);
  const change = (o: boolean) => { setOpen(o); if (!o) { setN((x) => x + 1); router.replace("/dashboard/api-keys"); router.refresh(); } };
  return (
    <Modal open={open} onOpenChange={change} title="Create API key" description="Keys authenticate the REST API (/api/v1) and the MCP server." trigger={<Button variant="primary" data-testid="new-key-btn"><Plus size={14} />Create key</Button>}>
      <ActionForm key={n} action={createKeyAction} className="space-y-4"><CreateBody scopes={scopes} onClose={() => change(false)} /></ActionForm>
    </Modal>
  );
}

export function RotateKey({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [res, setRes] = React.useState<ActionState>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button size="sm" onClick={() => { setRes(null); setOpen(true); }}><KeyRound size={13} />Rotate</Button>
      <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) router.refresh(); }} title={`Rotate “${name}”?`} description="A new key with the same scopes is created and the old one stops working immediately.">
        {res?.data?.key ? <><RevealKey k={String(res.data.key)} /><div className="mt-4 flex justify-end"><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></div></> : (
          <>{res?.error && <p role="alert" className="mb-3 text-[12.5px] text-red-600">{res.error}</p>}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={() => start(async () => setRes(await rotateKeyAction(id)))}>{pending ? "Rotating…" : "Rotate key"}</Button></div></>
        )}
      </Modal>
    </>
  );
}
