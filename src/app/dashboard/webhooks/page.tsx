import { requireSession } from "@/lib/session";
import { listWebhooks, listDeliveries } from "@/lib/webhooks";
import { listForms } from "@/lib/forms";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { WebhookList } from "@/components/app/automation-lists";
import { DeliveryRow } from "@/components/app/delivery-row";
import { timeAgo } from "@/lib/format";
import { Webhook } from "lucide-react";
export const metadata = { title: "Webhooks" };

export default async function Webhooks({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const hooks = listWebhooks(s.workspace.id);
  const url = new Map(hooks.map((h) => [h.id, h.url]));
  const all = listDeliveries(s.workspace.id, { limit: 200 });
  const deliveries = sp.status ? all.filter((d) => d.status === sp.status) : all;
  const forms = new Map(listForms(s.workspace.id).map((f) => [f.id, f.name]));
  const ok = all.filter((d) => d.status === "success").length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Webhooks" description="All endpoints across forms and a log of every delivery attempt. Add webhooks from a form's Automations tab." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Endpoints" value={hooks.length} />
        <Stat label="Deliveries (last 200)" value={all.length} />
        <Stat label="Success rate" value={all.length ? `${Math.round((ok / all.length) * 100)}%` : "—"} />
        <Stat label="Retrying / failed" value={`${all.filter((d) => d.status === "retrying").length} / ${all.filter((d) => d.status === "failed").length}`} />
      </div>
      <Card className="mb-4"><CardHeader title="Endpoints" /><WebhookList hooks={hooks} formNames={forms} /></Card>
      <Card>
        <CardHeader title="Delivery log" description="Click a row for payload and response." actions={
          <nav aria-label="Filter deliveries" className="flex gap-1 text-[12.5px]">{[["", "All"], ["success", "Succeeded"], ["retrying", "Retrying"], ["failed", "Failed"]].map(([v, l]) => <a key={v} href={v ? `?status=${v}` : "/dashboard/webhooks"} aria-current={(sp.status ?? "") === v ? "page" : undefined} className={`rounded-md px-2 py-1 ${(sp.status ?? "") === v ? "bg-muted font-medium text-fg" : "text-fg-subtle hover:text-fg"}`}>{l}</a>)}</nav>
        } />
        {deliveries.length ? <ul>{deliveries.map((d) => <DeliveryRow key={d.id} d={{ ...d, url: url.get(d.webhook_id) ?? "(deleted webhook)", when: timeAgo(d.created_at) }} />)}</ul> : <EmptyState icon={<Webhook size={16} />} title="No deliveries" description="Deliveries appear here when submissions trigger webhooks." />}
      </Card>
    </div>
  );
}
