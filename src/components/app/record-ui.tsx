"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Maximize2, RefreshCw, ShieldAlert, ShieldCheck, Trash2, UserRound, Archive, Loader2 } from "lucide-react";
import { Sheet, Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { bulkSubmissionsAction, reenrichAction, setOwnerAction } from "@/app/dashboard/actions";

export function RecordDrawer({ title, fullHref, children }: { title: string; fullHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const close = () => { const p = new URLSearchParams(sp.toString()); p.delete("s"); router.push(`${path}${p.size ? `?${p}` : ""}`, { scroll: false }); };
  return (
    <Sheet open onOpenChange={(o) => !o && close()} title={title} header={<Link href={fullHref} aria-label="Open full record page" title="Open full page" className="rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg"><Maximize2 size={15} /></Link>}>
      {children}
    </Sheet>
  );
}

export function RecordTabs({ tabs }: { tabs: { id: string; label: string; count?: number; content: React.ReactNode }[] }) {
  const [active, setActive] = React.useState(tabs[0]?.id);
  const ref = React.useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setActive(tabs[n].id);
      (ref.current?.querySelectorAll("[role=tab]")[n] as HTMLElement)?.focus();
    }
  };
  return (
    <div>
      <div ref={ref} role="tablist" aria-label="Record sections" onKeyDown={onKey} className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line px-3">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} tabIndex={active === t.id ? 0 : -1} onClick={() => setActive(t.id)}
            className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium", active === t.id ? "border-accent text-fg" : "border-transparent text-fg-subtle hover:text-fg")}>
            {t.label}{t.count != null && <span className="rounded bg-muted px-1 text-[11px] text-fg-subtle">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="p-4">{t.content}</div>
      ))}
    </div>
  );
}

export function RecordActions({ id, isSpam, owner, afterDelete }: { id: string; isSpam: boolean; owner: string | null; afterDelete: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [ownerOpen, setOwnerOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const run = (fn: () => Promise<{ ok?: boolean; message?: string; error?: string } | null>) => start(async () => { const r = await fn(); setMsg(r ? { ok: !r.error, text: r.error ?? r.message ?? "Done" } : null); router.refresh(); });
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => run(() => reenrichAction(id))} disabled={pending} data-testid="reenrich">{pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Re-enrich</Button>
        <Button size="sm" onClick={() => setOwnerOpen(true)}><UserRound size={13} />{owner ? "Reassign" : "Assign"}</Button>
        <Button size="sm" onClick={() => run(() => bulkSubmissionsAction([id], isSpam ? "not_spam" : "spam"))} disabled={pending}>{isSpam ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}{isSpam ? "Not spam" : "Mark spam"}</Button>
        <Button size="sm" onClick={() => run(() => bulkSubmissionsAction([id], "archived"))} disabled={pending}><Archive size={13} />Archive</Button>
        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirm(true)}><Trash2 size={13} />Delete</Button>
      </div>
      {msg && <p role="status" className={cn("mt-2 text-[12px]", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>}
      <Modal open={ownerOpen} onOpenChange={setOwnerOpen} title="Assign owner" description="Overrides the routing decision for this record.">
        <form onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("owner") ?? ""); setOwnerOpen(false); run(() => setOwnerAction(id, v)); }} className="space-y-3">
          <label htmlFor="owner-input" className="text-[12.5px] font-medium text-fg">Owner (name or email)</label>
          <Input id="owner-input" name="owner" defaultValue={owner ?? ""} placeholder="ava@company.com" autoFocus />
          <div className="flex justify-end gap-2"><Button onClick={() => setOwnerOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save owner</Button></div>
        </form>
      </Modal>
      <Modal open={confirm} onOpenChange={setConfirm} title="Delete submission?" description="This permanently removes the submission and any uploaded files.">
        <div className="flex justify-end gap-2"><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => { setConfirm(false); start(async () => { await bulkSubmissionsAction([id], "delete"); router.push(afterDelete); router.refresh(); }); }}>Delete</Button></div>
      </Modal>
    </div>
  );
}
