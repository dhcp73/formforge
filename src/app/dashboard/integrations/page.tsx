import { requireSession } from "@/lib/session";
import { listIntegrationsView } from "@/lib/integrations/store";
import { PageHeader, Card } from "@/components/ui/primitives";
import { IntegrationCard, UrlRow } from "@/components/app/integration-card";
import { saveIntegrationAction, testIntegrationAction } from "@/app/dashboard/actions";
import { publicUrl } from "@/lib/enrich/pipeline";
import type { IntegrationId } from "@/lib/integrations/registry";
export const metadata = { title: "Integrations" };

export default async function Integrations() {
  const s = await requireSession();
  const list = listIntegrationsView(s.workspace.id);
  const base = publicUrl();
  const extras: Record<string, React.ReactNode> = {
    clay: <UrlRow label="Callback URL (paste into Clay's HTTP API column)" url={`${base}/api/integrations/clay/callback`} />,
    valyu: <UrlRow label="DeepResearch webhook URL (sent automatically; needs a public https PUBLIC_URL)" url={`${base}/api/integrations/valyu/webhook`} />,
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Integrations" description="Bring your own keys. Keys are encrypted at rest (AES-256-GCM) and environment variables override workspace values. Providers without a key are skipped automatically." />
      <Card className="mb-4 p-4 text-[12.5px] text-fg-muted">
        <b className="text-fg">Enrichment waterfall:</b> Apollo → Clay → Valyu → offline dataset → IP geo → AI. Each field keeps the value from the highest-priority provider that returned it, with per-field source attribution. Results are cached per domain for 7 days.
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((v) => <IntegrationCard key={v.id} v={v} save={saveIntegrationAction.bind(null, v.id as IntegrationId)} test={testIntegrationAction.bind(null, v.id as IntegrationId)} extra={extras[v.id]} />)}
      </div>
    </div>
  );
}
