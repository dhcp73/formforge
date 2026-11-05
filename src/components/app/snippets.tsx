"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { CodeBlock } from "@/components/ui/copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function SnippetTabs({ snippets }: { snippets: { id: string; label: string; lang: string; code: string }[] }) {
  const [a, setA] = React.useState(snippets[0].id);
  const cur = snippets.find((s) => s.id === a)!;
  return (
    <div>
      <div role="tablist" aria-label="Code snippets" className="mb-2 flex flex-wrap gap-1">
        {snippets.map((s) => <button key={s.id} type="button" role="tab" aria-selected={a === s.id} onClick={() => setA(s.id)} className={cn("rounded-md px-2.5 py-1 text-[12.5px] font-medium", a === s.id ? "bg-fg text-bg" : "text-fg-subtle hover:bg-muted hover:text-fg")}>{s.label}</button>)}
      </div>
      <CodeBlock lang={cur.lang} code={cur.code} />
    </div>
  );
}

export function TestSubmission({ formId }: { formId: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "sending" | { ok: boolean; text: string }>("idle");
  const send = async () => {
    setState("sending");
    try {
      const r = await fetch(`/api/f/${formId}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ name: "Test Lead", email: "test.lead@stripe.com", company: "Stripe", message: "This is a test submission from the FormForge dashboard." }) });
      const j = await r.json().catch(() => ({}));
      setState({ ok: r.ok, text: r.ok ? `Accepted — submission ${j.id ?? ""} created. Enrichment runs in the background.` : `Rejected (${r.status}): ${j.message ?? "error"}` });
      router.refresh();
    } catch (e) { setState({ ok: false, text: String(e) }); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" onClick={send} disabled={state === "sending"} data-testid="send-test">{state === "sending" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send test submission</Button>
      {typeof state === "object" && <p role="status" className={cn("text-[12.5px]", state.ok ? "text-emerald-600" : "text-red-600")}>{state.text}</p>}
    </div>
  );
}
