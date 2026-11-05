import { requireSession } from "@/lib/session";
import { listIntegrationsView } from "@/lib/integrations/store";
import { PageHeader, Card } from "@/components/ui/primitives";
import { IntegrationCard, UrlRow } from "@/components/app/integration-card";
import { CalendarConnectCard } from "@/components/app/calendar-connect";
import { saveIntegrationAction, testIntegrationAction, saveCalendarAppConfigAction, disconnectCalendarAction } from "@/app/dashboard/actions";
import { publicUrl } from "@/lib/enrich/pipeline";
import { appConfigView, connectionsView } from "@/lib/calendar";
import type { IntegrationId } from "@/lib/integrations/registry";
export const metadata = { title: "Integrations" };

export default async function Integrations({ searchParams }: { searchParams: Promise<{ calendar?: string; error?: string; connected?: string }> }) {
  const s = await requireSession();
  const list = listIntegrationsView(s.workspace.id);
  const base = publicUrl();
  const sp = await searchParams;
  const googleApp = appConfigView(s.workspace.id, "google");
  const msApp = appConfigView(s.workspace.id, "microsoft");
  const conns = connectionsView(s.workspace.id, s.user.id);
  const googleConn = conns.find((c) => c.provider === "google") ?? null;
  const msConn = conns.find((c) => c.provider === "microsoft") ?? null;
  const extras: Record<string, React.ReactNode> = {
    clay: <UrlRow label="Callback URL (paste into Clay's HTTP API column)" url={`${base}/api/integrations/clay/callback`} />,
    valyu: <UrlRow label="DeepResearch webhook URL (sent automatically; needs a public https PUBLIC_URL)" url={`${base}/api/integrations/valyu/webhook`} />,
  };
  return (
    <div className="mx-auto max-w-6xl overflow-x-hidden">
      <PageHeader title="Integrations" description="Bring your own keys. Keys are encrypted at rest (AES-256-GCM) and environment variables override workspace values. Providers without a key are skipped automatically." />
      {(sp.error || sp.connected) && (
        <Card className={`mb-4 p-3 text-[13px] ${sp.error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {sp.error ? `Calendar connect error: ${sp.error}` : `${sp.calendar === "microsoft" ? "Microsoft" : "Google"} connected.`}
        </Card>
      )}
      <Card className="mb-4 p-4 text-[12.5px] text-fg-muted">
        <b className="text-fg">Enrichment waterfall:</b> Apollo → Clay → Valyu → offline dataset → IP geo → AI. Each field keeps the value from the highest-priority provider that returned it, with per-field source attribution. Results are cached per domain for 7 days.
      </Card>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">Calendar &amp; email</h2>
      <div className="mb-6 grid min-w-0 gap-4 lg:grid-cols-2">
        <CalendarConnectCard
          provider="google" label="Google" description="Connect Google Calendar free/busy + Meet links, and send confirmations with Gmail."
          docs="/docs/integrations/google" redirectUri={`${base}/api/oauth/google/callback`}
          app={googleApp} connection={googleConn}
          save={saveCalendarAppConfigAction.bind(null, "google")}
          disconnect={disconnectCalendarAction.bind(null, "google")}
        />
        <CalendarConnectCard
          provider="microsoft" label="Microsoft" description="Connect Outlook Calendar free/busy + Teams meetings, and send confirmations with Outlook Mail."
          docs="/docs/integrations/microsoft" redirectUri={`${base}/api/oauth/microsoft/callback`}
          app={msApp} connection={msConn}
          save={saveCalendarAppConfigAction.bind(null, "microsoft")}
          disconnect={disconnectCalendarAction.bind(null, "microsoft")}
        />
      </div>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">Enrichment &amp; AI</h2>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {list.map((v) => <IntegrationCard key={v.id} v={v} save={saveIntegrationAction.bind(null, v.id as IntegrationId)} test={testIntegrationAction.bind(null, v.id as IntegrationId)} extra={extras[v.id]} />)}
      </div>
    </div>
  );
}
