import { Mail } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listEmails } from "@/lib/email";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";
export const metadata = { title: "Outbox" };

export default async function Outbox() {
  const s = await requireSession();
  const emails = listEmails(s.workspace.id, 100);
  const smtp = !!process.env.SMTP_URL;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Email outbox" description={smtp ? "Every notification, autoresponder and digest — delivered via SMTP and logged here." : "SMTP_URL is not set, so emails are logged here instead of sent. Set SMTP_URL to deliver them."} />
      <Card>
        <CardHeader title={`${emails.length} recent emails`} actions={<Badge tone={smtp ? "green" : "amber"} dot>{smtp ? "SMTP connected" : "Log-only mode"}</Badge>} />
        {emails.length ? (
          <ul className="divide-y divide-line">
            {emails.map((e) => (
              <li key={e.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px] hover:bg-subtle">
                    <Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "gray"}>{e.status}</Badge><Badge>{e.kind}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{e.subject}</span><span className="text-fg-subtle">to {e.to_addr}</span><span className="w-16 text-right text-fg-subtle">{timeAgo(e.created_at)}</span>
                  </summary>
                  <pre className="mx-4 mb-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-subtle p-3 font-sans text-[12.5px] text-fg-muted">{e.text_body}{e.error ? `\n\nError: ${e.error}` : ""}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Mail size={16} />} title="No emails yet" description="Add notification emails to a form to see them here." />}
      </Card>
    </div>
  );
}
