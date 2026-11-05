"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyButton({ value, className, label = "Copy" }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" aria-label={label} title={label}
      onClick={async () => { try { await navigator.clipboard.writeText(value); } catch { /* clipboard blocked */ } setDone(true); setTimeout(() => setDone(false), 1500); }}
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg", className)}>
      {done ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}

export function CodeBlock({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-zinc-800 bg-[#0f0f14]", className)}>
      {lang && <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{lang}</div>}
      <CopyButton value={code} className="absolute right-1.5 top-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" />
      <pre tabIndex={0} className="scrollbar-thin overflow-x-auto p-3 text-[12.5px] leading-relaxed text-zinc-100"><code>{code}</code></pre>
    </div>
  );
}
