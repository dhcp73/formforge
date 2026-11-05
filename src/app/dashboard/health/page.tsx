import { Activity, ExternalLink } from "lucide-react";
import { requireSession } from "@/lib/session";
import { statusSummary } from "@/lib/monitor";
import { PageHeader, Card, CardHeader } from "@/components/ui/primitives";
import { StatusBoard } from "@/components/status-board";
import { ActionButton } from "@/components/app/action-button";
import { ButtonLink } from "@/components/ui/button";
import { runMonitorAction } from "@/app/dashboard/actions";
import { CodeBlock } from "@/components/ui/copy";
import { publicUrl } from "@/lib/enrich/pipeline";
export const metadata = { title: "System health" };
export const dynamic = "force-dynamic";

export default async function Health() {
  await requireSession();
  const summary = statusSummary();
  const base = publicUrl();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="System health" description="Synthetic probes run every 60 seconds against the database, ingest pipeline, REST, MCP, webhooks, queue, scheduler, email, routing and each provider. Incidents open after 2 consecutive failures and resolve automatically."
        actions={<><ButtonLink href="/status" target="_blank"><ExternalLink size={13} />Public status page</ButtonLink><ActionButton variant="primary" action={runMonitorAction}><Activity size={14} />Run checks now</ActionButton></>} />
      <StatusBoard summary={summary} />
      <Card className="mt-6">
        <CardHeader title="Health endpoints" description="For load balancers, uptime monitors and CI." />
        <div className="grid gap-3 p-3 lg:grid-cols-3">
          <CodeBlock lang="liveness" code={`curl ${base}/api/health`} />
          <CodeBlock lang="readiness (503 if down)" code={`curl ${base}/api/health/ready`} />
          <CodeBlock lang="full status (API key)" code={`curl ${base}/api/v1/status \\\n  -H "Authorization: Bearer ff_live_…"`} />
        </div>
      </Card>
    </div>
  );
}
