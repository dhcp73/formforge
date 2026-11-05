"use client";
import * as React from "react";
import { ChevronRight, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { ActionButton } from "./action-button";
import { redeliverAction } from "@/app/dashboard/actions";
import { cn } from "@/lib/cn";

export interface DeliveryView { id: string; event: string; status: string; attempts: number; response_status: number | null; response_body: string | null; error: string | null; duration_ms: number | null; next_attempt_at: string | null; created_at: string; payload: string; url: string; when: string }

export function DeliveryRow({ d }: { d: DeliveryView }) {
  const [open, setOpen] = React.useState(false);
  const pretty = (s: string | null) => { if (!s) return ""; try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left text-[12.5px] hover:bg-subtle">
        <ChevronRight size={13} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} />
        <Badge tone={d.status === "success" ? "green" : d.status === "failed" ? "red" : "amber"} dot>{d.status}</Badge>
        <code className="font-mono text-[11.5px] text-fg">{d.event}</code>
        <span className="min-w-0 flex-1 truncate text-fg-subtle">{d.url}</span>
        <span className="tabular-nums text-fg-subtle">HTTP {d.response_status ?? "—"} · {d.duration_ms ?? 0} ms · try {d.attempts}</span>
        <span className="w-20 text-right text-fg-subtle">{d.when}</span>
      </button>
      {open && (
        <div className="grid gap-3 bg-subtle/60 px-4 py-3 lg:grid-cols-2">
          <div><p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-fg-subtle">Request payload</p><pre className="scrollbar-thin max-h-64 overflow-auto rounded-md border border-line bg-panel p-2 font-mono text-[11.5px] text-fg-muted">{pretty(d.payload)}</pre></div>
          <div><p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-fg-subtle">Response {d.error && <span className="normal-case text-red-600">· {d.error}</span>}</p><pre className="scrollbar-thin max-h-64 overflow-auto rounded-md border border-line bg-panel p-2 font-mono text-[11.5px] text-fg-muted">{pretty(d.response_body) || "(empty)"}</pre>
            {d.next_attempt_at && d.status === "retrying" && <p className="mt-1 text-[12px] text-amber-600">Next retry {new Date(d.next_attempt_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London" })} UK</p>}
            <div className="mt-2"><ActionButton size="sm" action={redeliverAction.bind(null, d.id)}><RotateCw size={13} />Redeliver</ActionButton></div>
          </div>
        </div>
      )}
    </li>
  );
}
