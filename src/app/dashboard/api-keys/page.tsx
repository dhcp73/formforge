import { KeyRound, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listApiKeys } from "@/lib/apikeys";
import { SCOPES, SCOPE_DESCRIPTIONS } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CreateKey, RotateKey } from "@/components/app/api-keys-ui";
import { ActionButton } from "@/components/app/action-button";
import { revokeKeyAction } from "@/app/dashboard/actions";
import { CodeBlock } from "@/components/ui/copy";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate, timeAgo } from "@/lib/format";
import { publicUrl } from "@/lib/enrich/pipeline";
export const metadata = { title: "API keys" };

export default async function ApiKeys() {
  const s = await requireSession();
  const keys = listApiKeys(s.workspace.id);
  const base = publicUrl();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="API keys" description="Scoped, hashed keys for the REST API and MCP server. Only the prefix is stored in readable form." actions={<><ButtonLink href="/docs/api">API reference</ButtonLink><CreateKey scopes={SCOPES.map((sc) => [sc, SCOPE_DESCRIPTIONS[sc]])} /></>} />
      <Card className="overflow-hidden">
        {keys.length === 0 ? <EmptyState icon={<KeyRound size={16} />} title="No API keys" description="Create a key to use the REST API, MCP server or SDKs." /> : (
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="bg-subtle text-left text-[11.5px] uppercase tracking-wide text-fg-subtle"><tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Key</th><th className="px-4 py-2 font-medium">Scopes</th><th className="px-4 py-2 font-medium">Last used</th><th className="px-4 py-2 font-medium">Created</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody>
                {keys.map((k) => {
                  const expired = k.expiresAt && new Date(k.expiresAt) < new Date();
                  return (
                    <tr key={k.id} className="border-t border-line align-top">
                      <td className="px-4 py-2.5 font-medium text-fg">{k.name}</td>
                      <td className="px-4 py-2.5"><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-fg-muted">{k.prefix}…</code></td>
                      <td className="px-4 py-2.5"><div className="flex max-w-xs flex-wrap gap-1">{k.scopes.map((sc) => <Badge key={sc} tone={sc.endsWith("write") ? "amber" : "gray"}>{sc}</Badge>)}</div></td>
                      <td className="px-4 py-2.5 text-fg-subtle">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : "Never"}</td>
                      <td className="px-4 py-2.5 text-fg-subtle">{fmtDate(k.createdAt)}{k.expiresAt && <div className="text-[11.5px]">expires {fmtDate(k.expiresAt)}</div>}</td>
                      <td className="px-4 py-2.5">{k.revokedAt ? <Badge tone="red">Revoked</Badge> : expired ? <Badge tone="amber">Expired</Badge> : <Badge tone="green" dot>Active</Badge>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{!k.revokedAt && <span className="inline-flex gap-1.5"><RotateKey id={k.id} name={k.name} /><ActionButton size="sm" variant="ghost" className="text-red-600" action={revokeKeyAction.bind(null, k.id)} confirm={{ title: `Revoke “${k.name}”?`, description: "Requests using this key will fail immediately. This can't be undone." }} confirmText="Revoke" showResult={false}><Trash2 size={13} />Revoke</ActionButton></span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Use the REST API" /><div className="p-3"><CodeBlock lang="bash" code={`curl ${base}/api/v1/forms \\\n  -H "Authorization: Bearer ff_live_…"`} /></div></Card>
        <Card><CardHeader title="Use from Cursor / Claude (MCP)" actions={<ButtonLink href="/docs/mcp" size="sm" variant="ghost">MCP docs</ButtonLink>} /><div className="p-3"><CodeBlock lang="json" code={JSON.stringify({ mcpServers: { formforge: { url: `${base}/api/mcp`, headers: { Authorization: "Bearer ff_live_…" } } } }, null, 2)} /></div></Card>
      </div>
    </div>
  );
}
