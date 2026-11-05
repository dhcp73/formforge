import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getForm } from "@/lib/forms";
import { Card, CardHeader, Input, Textarea, Select, Badge } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlay";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { FieldsEditor, TzOffsetInput, LocalDateTime, ToggleRow, DeepResearchMode, DangerZone } from "@/components/app/form-settings-ui";
import { saveGeneralAction, saveSpamAction, saveScheduleWindowAction, saveNotificationsAction, saveFieldsAction, saveEnrichmentSettingsAction, deleteFormAction } from "@/app/dashboard/actions";
import { resolveProvider } from "@/lib/integrations/store";
import { DEEP_RESEARCH_CREDITS } from "@/lib/integrations/registry";

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return <Card id={id} className="scroll-mt-20"><CardHeader title={title} description={description} /><div className="p-4">{children}</div></Card>;
}

export default async function FormSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const form = getForm(s.workspace.id, id);
  if (!form) notFound();
  const st = form.settings;
  const ws = s.workspace.id;
  const prov = (p: "apollo" | "clay" | "valyu" | "openai" | "openrouter") => resolveProvider(ws, p);
  const aiReady = prov("openai").enabled || prov("openrouter").enabled;
  const status = (on: boolean) => on ? <Badge tone="green">Connected</Badge> : <Badge>Not connected</Badge>;
  const mapping = Object.entries(st.fieldMapping ?? {}).map(([a, b]) => `${a} => ${b}`).join("\n");
  const nav = [["general", "General"], ["fields", "Fields & schema"], ["spam", "Spam protection"], ["window", "Schedule window"], ["notifications", "Notifications"], ["enrichment", "Enrichment"], ["danger", "Danger zone"]];
  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
      <nav aria-label="Settings sections" className="hidden lg:block"><ul className="sticky top-20 space-y-0.5 text-[13px]">{nav.map(([h, l]) => <li key={h}><a href={`#${h}`} className="block rounded-md px-2 py-1.5 text-fg-muted hover:bg-muted hover:text-fg">{l}</a></li>)}</ul></nav>
      <div className="min-w-0 space-y-4">
        <Section id="general" title="General" description="Name, redirect behaviour and allowed origins.">
          <ActionForm action={saveGeneralAction.bind(null, id)} className="space-y-4">
            <FormMessage />
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="name" label="Form name"><Input defaultValue={form.name} /></Field>
              <Field name="honeypotField" label="Honeypot field name" hint="Hidden input bots fill in."><Input defaultValue={st.honeypotField} className="font-mono" /></Field>
            </div>
            <Field name="description" label="Description"><Textarea rows={2} defaultValue={form.description} /></Field>
            <Field name="redirectUrl" label="Redirect URL" hint="Where HTML submissions go afterwards. Empty = hosted thank-you page."><Input defaultValue={st.redirectUrl ?? ""} placeholder="https://example.com/thanks" /></Field>
            <Field name="allowedDomains" label="Allowed domains" hint="Comma or newline separated. Empty = accept from anywhere. Supports *.example.com."><Textarea rows={2} defaultValue={(st.allowedDomains ?? []).join("\n")} placeholder="example.com" /></Field>
            <div className="flex items-center gap-2"><Switch name="active" label="Accepting submissions" defaultChecked={form.status === "active"} /><span className="text-[13px] text-fg">Accepting submissions</span></div>
            <SubmitButton>Save general</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="fields" title="Fields & schema" description="Optional. Define fields to validate, coerce types and rename keys — or leave empty to accept anything.">
          <ActionForm action={saveFieldsAction.bind(null, id)} className="space-y-4">
            <FormMessage />
            <Field name="schemaMode" label="Schema mode" hint="Off: accept anything · Validate: check defined fields, keep extras · Strict: reject unknown fields.">
              <Select defaultValue={st.schemaMode} className="max-w-xs"><option value="off">Off</option><option value="validate">Validate</option><option value="strict">Strict</option></Select>
            </Field>
            <FieldsEditor initial={st.fields ?? []} />
            <Field name="fieldMapping" label="Field mapping" hint="One per line: incoming_name => stored_name. Useful when different sites post different keys."><Textarea rows={3} defaultValue={mapping} placeholder={"Email Address => email\nyour-name => name"} className="font-mono" /></Field>
            <SubmitButton>Save fields</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="spam" title="Spam protection" description="Honeypot, rate limiting, duplicate detection and a 0–100 spam score.">
          <ActionForm action={saveSpamAction.bind(null, id)} className="space-y-4">
            <FormMessage />
            <div className="grid gap-4 md:grid-cols-3">
              <Field name="spamThreshold" label="Spam threshold" hint="Score ≥ this is spam (1–100)."><Input type="number" min={1} max={100} defaultValue={st.spamThreshold} /></Field>
              <Field name="rateLimitPerMinute" label="Rate limit / IP / minute"><Input type="number" min={1} defaultValue={st.rateLimitPerMinute} /></Field>
              <Field name="duplicateWindowMinutes" label="Duplicate window (min)" hint="0 disables."><Input type="number" min={0} defaultValue={st.duplicateWindowMinutes} /></Field>
            </div>
            <Field name="spamAction" label="When spam is detected"><Select defaultValue={st.spamAction} className="max-w-xs"><option value="flag">Flag and keep in Spam folder</option><option value="reject">Reject with an error</option></Select></Field>
            <SubmitButton>Save spam settings</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="window" title="Schedule window" description="Open and close the form automatically, or cap total submissions.">
          <ActionForm action={saveScheduleWindowAction.bind(null, id)} className="space-y-4">
            <FormMessage /><TzOffsetInput />
            <div className="grid gap-4 md:grid-cols-3">
              <Field name="opensAt" label="Opens at" hint="Your local time."><LocalDateTime id="f-opensAt" name="opensAt" iso={st.opensAt ?? null} /></Field>
              <Field name="closesAt" label="Closes at"><LocalDateTime id="f-closesAt" name="closesAt" iso={st.closesAt ?? null} /></Field>
              <Field name="maxSubmissions" label="Submission cap"><Input type="number" min={1} defaultValue={st.maxSubmissions ?? ""} placeholder="Unlimited" /></Field>
            </div>
            <Field name="closedMessage" label="Closed message"><Input defaultValue={st.closedMessage} /></Field>
            <SubmitButton>Save window</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="notifications" title="Notifications" description="Email your team on each submission and auto-reply to the submitter.">
          <ActionForm action={saveNotificationsAction.bind(null, id)} className="space-y-4">
            <FormMessage />
            <Field name="notifyEmails" label="Notify these addresses" hint="Comma separated. Without SMTP_URL, emails go to the Outbox."><Input defaultValue={(st.notifyEmails ?? []).join(", ")} placeholder="sales@example.com" /></Field>
            <div className="flex items-center gap-2"><Switch name="notifyOnSpam" label="Also notify on spam" defaultChecked={st.notifyOnSpam} /><span className="text-[13px] text-fg">Also notify on spam</span></div>
            <div className="rounded-md border border-line p-3">
              <div className="mb-3 flex items-center gap-2"><Switch name="autoresponderEnabled" label="Autoresponder" defaultChecked={st.autoresponder?.enabled} /><span className="text-[13px] font-medium text-fg">Autoresponder to the submitter</span></div>
              <div className="space-y-3">
                <Field name="autoresponderSubject" label="Subject"><Input defaultValue={st.autoresponder?.subject} /></Field>
                <Field name="autoresponderBody" label="Body" hint="Use {{field}} placeholders, e.g. {{name}}."><Textarea rows={3} defaultValue={st.autoresponder?.body} /></Field>
              </div>
            </div>
            <SubmitButton>Save notifications</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="enrichment" title="Enrichment" description="Waterfall: Apollo → Clay → offline dataset → IP geo → AI. Providers without keys are skipped automatically.">
          <ActionForm action={saveEnrichmentSettingsAction.bind(null, id)} className="space-y-1">
            <FormMessage className="mb-2" />
            <div className="divide-y divide-line">
              <ToggleRow name="email" label="Email verification" description="Syntax, MX records, disposable and role-account detection." defaultChecked={st.enrichment.email} badge={<Badge tone="green">Built-in</Badge>} />
              <ToggleRow name="geo" label="IP geolocation" description="Country, city and timezone from the submitter's IP (offline database)." defaultChecked={st.enrichment.geo} badge={<Badge tone="green">Built-in</Badge>} />
              <ToggleRow name="userAgent" label="Device & browser" description="Parse user-agent; flag bots." defaultChecked={st.enrichment.userAgent} badge={<Badge tone="green">Built-in</Badge>} />
              <ToggleRow name="company" label="Company from email domain" description="Offline company dataset + domain heuristics." defaultChecked={st.enrichment.company} badge={<Badge tone="green">Built-in</Badge>} />
              <ToggleRow name="apollo" label="Apollo.io" description="People match + organization enrichment (title, seniority, size, revenue)." defaultChecked={st.enrichment.apollo} badge={status(prov("apollo").enabled)} />
              <ToggleRow name="clay" label="Clay" description="Push to a Clay table; results return via a signed callback and re-run routing." defaultChecked={st.enrichment.clay} badge={status(prov("clay").enabled)} />
              <ToggleRow name="valyu" label="Valyu Search" description="Quick web research on the company for summary and buying signals." defaultChecked={st.enrichment.valyu} badge={status(prov("valyu").enabled)} />
              <ToggleRow name="ai" label="AI qualification" description="Summary, intent, ICP score via OpenAI or OpenRouter (Vercel AI SDK)." defaultChecked={st.enrichment.ai} badge={status(aiReady)} />
              <ToggleRow name="deepResearch" label="Valyu DeepResearch" description="Async deep company research with structured output; merged when the webhook (or poll) completes." defaultChecked={st.enrichment.deepResearch} badge={status(prov("valyu").enabled)} />
            </div>
            <div className="py-3"><DeepResearchMode defaultMode={st.enrichment.deepResearchMode} credits={DEEP_RESEARCH_CREDITS} /></div>
            <SubmitButton>Save enrichment</SubmitButton>
          </ActionForm>
        </Section>
        <Section id="danger" title="Danger zone" description="Deleting a form removes everything attached to it.">
          <DangerZone name={form.name} onDelete={deleteFormAction.bind(null, id)} />
        </Section>
      </div>
    </div>
  );
}
