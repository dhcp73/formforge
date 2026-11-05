import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getForm } from "@/lib/forms";
import { listWebhooks } from "@/lib/webhooks";
import { listSchedules } from "@/lib/schedules";
import { listRules } from "@/lib/routing";
import { Card, CardHeader, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { WebhookList, ScheduleList } from "@/components/app/automation-lists";
import { NewWebhook, NewSchedule } from "@/components/app/automation-forms";
import { createWebhookAction, createScheduleAction } from "@/app/dashboard/actions";
import { CodeBlock } from "@/components/ui/copy";

export default async function Automations({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const form = getForm(s.workspace.id, id);
  if (!form) notFound();
  const rules = listRules(s.workspace.id).filter((r) => !r.formId || r.formId === id);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card><CardHeader title="Webhooks" description="Signed with HMAC-SHA256 (X-FormForge-Signature: t=…,v1=…)." actions={<NewWebhook action={createWebhookAction.bind(null, id)} />} /><WebhookList hooks={listWebhooks(s.workspace.id, id)} /></Card>
        <Card><CardHeader title="Schedules" description="Digests, batch webhooks and CSV exports on a cron." actions={<NewSchedule action={createScheduleAction.bind(null, id)} />} /><ScheduleList items={listSchedules(s.workspace.id, id)} /></Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Routing rules" description="Rules that apply to this form." actions={<ButtonLink href="/dashboard/routing" size="sm">Manage</ButtonLink>} />
          <ul className="divide-y divide-line">{rules.length ? rules.map((r) => <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]"><span className="text-fg">{r.name}</span>{r.active ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}</li>) : <li className="px-4 py-4 text-[12.5px] text-fg-subtle">No rules yet — leads stay unassigned.</li>}</ul>
        </Card>
        <Card>
          <CardHeader title="Verify signatures" />
          <div className="p-3"><CodeBlock lang="ts" code={`import crypto from "node:crypto";
const [t, v1] = header.split(",").map(p => p.split("=")[1]);
const expected = crypto.createHmac("sha256", secret)
  .update(\`\${t}.\${rawBody}\`).digest("hex");
const ok = crypto.timingSafeEqual(
  Buffer.from(v1), Buffer.from(expected));`} /></div>
        </Card>
      </div>
    </div>
  );
}
