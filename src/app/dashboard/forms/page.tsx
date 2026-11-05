import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listForms, formAvailability } from "@/lib/forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CreateFormButton } from "@/components/app/create-form";
import { CopyButton } from "@/components/ui/copy";
import { publicUrl } from "@/lib/enrich/pipeline";
import { timeAgo } from "@/lib/format";
export const metadata = { title: "Forms" };

const REASON: Record<string, string> = { paused: "Paused", not_open_yet: "Scheduled", closed: "Closed", cap_reached: "Cap reached" };

export default async function FormsPage() {
  const s = await requireSession();
  const forms = listForms(s.workspace.id);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Forms" description="Each form has a public endpoint that accepts HTML, JSON and file uploads." actions={<CreateFormButton />} />
      <Card className="overflow-hidden">
        {forms.length === 0 ? (
          <EmptyState icon={<FileText size={16} />} title="No forms yet" description="Create a form to get an endpoint. It takes about ten seconds." action={<CreateFormButton label="Create your first form" />} />
        ) : (
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="sticky top-0 bg-subtle text-[11.5px] uppercase tracking-wide text-fg-subtle">
                <tr><th className="px-4 py-2 font-medium">Form</th><th className="px-4 py-2 font-medium">Endpoint</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Submissions</th><th className="px-4 py-2 text-right font-medium">Spam</th><th className="px-4 py-2 font-medium">Last activity</th><th className="w-10 px-2 py-2"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody>
                {forms.map((f) => {
                  const a = formAvailability(f, f.submissionCount);
                  const endpoint = `${publicUrl()}/api/f/${f.id}`;
                  return (
                    <tr key={f.id} className="group border-t border-line hover:bg-subtle/60">
                      <td className="px-4 py-2.5"><Link href={`/dashboard/forms/${f.id}`} className="font-medium text-fg hover:text-accent">{f.name}</Link>{f.description && <div className="max-w-xs truncate text-[12px] text-fg-subtle">{f.description}</div>}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-1"><code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-fg-muted">/api/f/{f.id}</code><CopyButton value={endpoint} label="Copy endpoint URL" /></div></td>
                      <td className="px-4 py-2.5">{a.open ? <Badge tone="green" dot>Accepting</Badge> : <Badge tone={a.reason === "paused" ? "gray" : "amber"} dot>{REASON[a.reason!]}</Badge>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg">{f.submissionCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-subtle">{f.spamCount}</td>
                      <td className="px-4 py-2.5 text-fg-subtle">{f.lastSubmissionAt ? timeAgo(f.lastSubmissionAt) : "Never"}</td>
                      <td className="px-2 py-2.5"><Link href={`/dashboard/forms/${f.id}`} aria-label={`Open ${f.name}`} className="inline-flex rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg"><ArrowRight size={14} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
