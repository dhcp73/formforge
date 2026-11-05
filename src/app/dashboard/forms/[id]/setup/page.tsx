import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getForm } from "@/lib/forms";
import { publicUrl } from "@/lib/enrich/pipeline";
import { Card, CardHeader, Badge } from "@/components/ui/primitives";
import { SnippetTabs, TestSubmission } from "@/components/app/snippets";
import { CodeBlock } from "@/components/ui/copy";
import { ButtonLink } from "@/components/ui/button";

export default async function Setup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession();
  const form = getForm(s.workspace.id, id);
  if (!form) notFound();
  const base = publicUrl();
  const ep = `${base}/api/f/${id}`;
  const html = `<form action="${ep}" method="POST" enctype="multipart/form-data">
  <input type="text" name="name" placeholder="Your name" required>
  <input type="email" name="email" placeholder="Work email" required>
  <input type="text" name="company" placeholder="Company">
  <textarea name="message"></textarea>
  <input type="file" name="attachment">
  <!-- honeypot: keep hidden, bots fill it in -->
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <!-- optional: where to send the visitor afterwards -->
  <input type="hidden" name="_next" value="https://example.com/thanks">
  <button type="submit">Send</button>
</form>`;
  const fetchJs = `const res = await fetch("${ep}", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ name: "Ada Lovelace", email: "ada@acme.io", plan: "pro" }),
});
const data = await res.json(); // { ok: true, id: "sub_…" } or { ok: false, error, details }`;
  const react = `"use client";
import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("${ep}", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(e.currentTarget), // files work too
    });
    setStatus(res.ok ? "done" : "error");
  }
  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <textarea name="message" />
      <button disabled={status === "sending"}>Send</button>
      {status === "done" && <p>Thanks!</p>}
    </form>
  );
}`;
  const curl = `curl -X POST ${ep} \\
  -H "Accept: application/json" \\
  -d "email=ada@acme.io" -d "message=Hello"`;
  const embed = `<iframe src="${base}/f/${id}?embed=1" width="100%" height="560" style="border:0" title="${form.name}"></iframe>`;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {sp.created && <Card className="border-emerald-500/30 bg-emerald-500/5 p-4 text-[13px] text-fg"><b>Form created.</b> Point any form at the endpoint below — no field configuration needed.</Card>}
        <Card>
          <CardHeader title="Connect your form" description="Post urlencoded, multipart (with files) or JSON. Every field is captured automatically." />
          <div className="p-4"><SnippetTabs snippets={[{ id: "html", label: "HTML", lang: "html", code: html }, { id: "fetch", label: "fetch / JSON", lang: "javascript", code: fetchJs }, { id: "react", label: "React / Next.js", lang: "tsx", code: react }, { id: "curl", label: "cURL", lang: "bash", code: curl }]} /></div>
        </Card>
        <Card>
          <CardHeader title="Embed the hosted form" description="Renders the fields from your schema (or a sensible default) on a FormForge-hosted page." actions={<ButtonLink href={`/f/${id}`} size="sm" target="_blank">Open hosted form</ButtonLink>} />
          <div className="p-4"><CodeBlock lang="html" code={embed} /></div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Try it" description="Sends a JSON submission to this form." />
          <div className="p-4"><TestSubmission formId={id} /></div>
        </Card>
        <Card>
          <CardHeader title="Special fields" />
          <ul className="divide-y divide-line text-[12.5px]">
            {[["_gotcha", "Honeypot. Submissions with a value go straight to Spam."], ["_next / _redirect", "Redirect URL after a successful HTML submit."], ["_subject", "Subject line for notification emails."], ["Accept: application/json", "Return JSON instead of redirecting."]].map(([k, v]) => <li key={k} className="px-4 py-2.5"><Badge>{k}</Badge><p className="mt-1 text-fg-subtle">{v}</p></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
