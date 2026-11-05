"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton, type ActionState } from "@/components/ui/action-form";

type A = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function NewWebhook({ action }: { action: A }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Modal open={open} onOpenChange={setOpen} title="Add webhook" description="We POST signed JSON to this URL. Failed deliveries retry with backoff (30s, 2m, 10m, 1h)." trigger={<Button size="sm" variant="primary"><Plus size={13} />Add webhook</Button>}>
      <ActionForm action={action} className="space-y-4" onDone={(s) => s?.ok && setOpen(false)}>
        <FormMessage />
        <Field name="url" label="Endpoint URL"><Input placeholder="https://example.com/hooks/formforge" autoFocus /></Field>
        <fieldset className="space-y-1.5"><legend className="text-[12.5px] font-medium text-fg">Events</legend>
          {[["submission.created", "Submission created"], ["submission.enriched", "Enrichment completed"], ["submission.routed", "Lead routed"]].map(([v, l], i) => (
            <label key={v} className="flex items-center gap-2 text-[13px] text-fg"><input type="checkbox" name="events" value={v} defaultChecked={i === 0} className="h-3.5 w-3.5 accent-[var(--accent)]" />{l} <code className="text-[11.5px] text-fg-subtle">{v}</code></label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-[13px] text-fg"><input type="checkbox" name="includeSpam" className="h-3.5 w-3.5 accent-[var(--accent)]" />Also send spam submissions</label>
        <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><SubmitButton pendingText="Creating…">Create webhook</SubmitButton></div>
      </ActionForm>
    </Modal>
  );
}

export function NewSchedule({ action }: { action: A }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState("digest");
  const [preset, setPreset] = React.useState("0 9 * * *");
  return (
    <Modal open={open} onOpenChange={setOpen} title="New schedule" description="Runs on the FormForge job runner. Times use the timezone you pick." trigger={<Button size="sm" variant="primary"><Plus size={13} />New schedule</Button>}>
      <ActionForm action={action} className="space-y-4" onDone={(s) => s?.ok && setOpen(false)}>
        <FormMessage />
        <Field name="name" label="Name"><Input placeholder="Daily digest for sales" autoFocus /></Field>
        <Field name="kind" label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="digest">Email digest of new submissions</option><option value="webhook_export">POST new submissions to a URL (batch)</option><option value="csv_export">Write a CSV export file</option></Select></Field>
        {kind === "digest" && <Field name="recipients" label="Recipients" hint="Comma separated"><Input placeholder="sales@example.com" /></Field>}
        {kind === "webhook_export" && <Field name="url" label="Destination URL"><Input placeholder="https://example.com/batch" /></Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="preset" label="When"><Select value={preset} onChange={(e) => setPreset(e.target.value)}><option value="*/15 * * * *">Every 15 minutes</option><option value="0 * * * *">Hourly</option><option value="0 9 * * *">Daily at 09:00</option><option value="0 9 * * 1">Mondays at 09:00</option><option value="custom">Custom cron…</option></Select></Field>
          <Field name="timezone" label="Timezone"><Select defaultValue="Europe/London">{["UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
        {preset === "custom" && <Field name="cron" label="Cron expression" hint="minute hour day month weekday — e.g. 30 8 * * 1-5"><Input placeholder="30 8 * * 1-5" className="font-mono" /></Field>}
        <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><SubmitButton pendingText="Saving…">Create schedule</SubmitButton></div>
      </ActionForm>
    </Modal>
  );
}
