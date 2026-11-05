"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Switch, Modal } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/components/ui/action-form";

type Act = () => Promise<ActionState | void>;

export function ActionButton({ action, children, confirm, confirmText = "Confirm", showResult = true, ...p }: ButtonProps & { action: Act; confirm?: { title: string; description: string }; confirmText?: string; showResult?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [res, setRes] = React.useState<ActionState>(null);
  const [open, setOpen] = React.useState(false);
  const go = () => start(async () => { const r = await action(); setRes(r ?? null); router.refresh(); });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button {...p} disabled={pending || p.disabled} onClick={() => (confirm ? setOpen(true) : go())}>{pending && <Loader2 size={13} className="animate-spin" />}{children}</Button>
      {showResult && res && (res.message || res.error) && <span role={res.error ? "alert" : "status"} className={cn("text-[12px]", res.error ? "text-red-600" : "text-emerald-600")}>{res.error ?? res.message}</span>}
      {confirm && (
        <Modal open={open} onOpenChange={setOpen} title={confirm.title} description={confirm.description}>
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => { setOpen(false); go(); }}>{confirmText}</Button></div>
        </Modal>
      )}
    </span>
  );
}

export function ActionSwitch({ checked, action, label }: { checked: boolean; action: (v: boolean) => Promise<ActionState | void>; label: string }) {
  const router = useRouter();
  const [v, setV] = React.useState(checked);
  const [err, setErr] = React.useState<string | null>(null);
  const [, start] = React.useTransition();
  React.useEffect(() => setV(checked), [checked]);
  return (
    <span className="inline-flex items-center gap-2">
      <Switch label={label} checked={v} onCheckedChange={(n) => { setV(n); setErr(null); start(async () => { const r = await action(n); if (r && r.error) { setErr(r.error); setV(!n); } router.refresh(); }); }} />
      {err && <span role="alert" className="text-[12px] text-red-600">{err}</span>}
    </span>
  );
}
