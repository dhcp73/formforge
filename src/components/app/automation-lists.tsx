import Link from "next/link";
import { Webhook as WebhookIcon, CalendarClock, Play, Send, Trash2 } from "lucide-react";
import type { Webhook } from "@/lib/webhooks";
import type { Schedule } from "@/lib/schedules";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy";
import { ActionButton, ActionSwitch } from "./action-button";
import { toggleWebhookAction, deleteWebhookAction, testWebhookAction, runScheduleAction, toggleScheduleAction, deleteScheduleAction } from "@/app/dashboard/actions";
import { fmtDate, timeAgo } from "@/lib/format";

export function WebhookList({ hooks, formNames }: { hooks: Webhook[]; formNames?: Map<string, string> }) {
  if (!hooks.length) return <EmptyState icon={<WebhookIcon size={16} />} title="No webhooks" description="Send each submission to Slack, Zapier, n8n, your CRM or your own API." />;
  return (
    <ul className="divide-y divide-line">
      {hooks.map((h) => (
        <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="truncate font-mono text-[12.5px] text-fg">{h.url}</span>{h.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Paused</Badge>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
              {formNames && <span>{formNames.get(h.formId)} ·</span>}
              {h.events.map((e) => <Badge key={e}>{e}</Badge>)}{h.includeSpam && <Badge tone="amber">incl. spam</Badge>}
              <span className="ml-1 inline-flex items-center gap-1">Secret <code className="font-mono">{h.secret.slice(0, 10)}…</code><CopyButton value={h.secret} label="Copy signing secret" /></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionSwitch checked={h.active} label={`Toggle webhook ${h.url}`} action={toggleWebhookAction.bind(null, h.id)} />
            <ActionButton size="sm" action={testWebhookAction.bind(null, h.id)}><Send size={13} />Send test</ActionButton>
            <ActionButton size="sm" variant="ghost" aria-label="Delete webhook" action={deleteWebhookAction.bind(null, h.id)} confirm={{ title: "Delete webhook?", description: "Deliveries stop immediately. Logs are kept." }} confirmText="Delete" showResult={false}><Trash2 size={13} /></ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

const KIND: Record<string, string> = { digest: "Email digest", webhook_export: "Batch webhook", csv_export: "CSV export" };
export function ScheduleList({ items, formNames }: { items: Schedule[]; formNames?: Map<string, string> }) {
  if (!items.length) return <EmptyState icon={<CalendarClock size={16} />} title="No schedules" description="Send digests, batch exports or CSVs on a cron schedule." />;
  return (
    <ul className="divide-y divide-line">
      {items.map((s) => (
        <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-medium text-fg">{s.name}</span><Badge tone="indigo">{KIND[s.kind]}</Badge>{s.lastStatus && <Badge tone={s.lastStatus === "success" ? "green" : "red"}>{s.lastStatus}</Badge>}</div>
            <p className="mt-1 text-[12px] text-fg-subtle">
              {formNames && <><Link href={`/dashboard/forms/${s.formId}/automations`} className="hover:text-fg">{formNames.get(s.formId)}</Link> · </>}
              <code className="font-mono">{s.cron}</code> ({s.timezone}) · next {s.active ? fmtDate(s.nextRunAt) : "paused"}{s.lastRunAt ? ` · last ${timeAgo(s.lastRunAt)}` : ""}
            </p>
            {s.lastDetail && <p className="mt-0.5 text-[12px] text-fg-subtle">{s.lastDetail}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionSwitch checked={s.active} label={`Toggle schedule ${s.name}`} action={toggleScheduleAction.bind(null, s.id)} />
            <ActionButton size="sm" action={runScheduleAction.bind(null, s.id)}><Play size={13} />Run now</ActionButton>
            <ActionButton size="sm" variant="ghost" aria-label="Delete schedule" action={deleteScheduleAction.bind(null, s.id)} confirm={{ title: "Delete schedule?", description: "It will no longer run." }} confirmText="Delete" showResult={false}><Trash2 size={13} /></ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}
