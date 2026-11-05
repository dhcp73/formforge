import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getForm, formAvailability } from "@/lib/forms";
import { getDb } from "@/lib/db";
import { Badge } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/copy";
import { FormTabs } from "@/components/app/form-tabs";
import { publicUrl } from "@/lib/enrich/pipeline";
import { ButtonLink } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default async function FormLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const form = getForm(s.workspace.id, id);
  if (!form) notFound();
  const count = (getDb().prepare("SELECT COUNT(*) AS c FROM submissions WHERE form_id = ? AND is_spam = 0").get(id) as { c: number }).c;
  const a = formAvailability(form, count);
  const endpoint = `${publicUrl()}/api/f/${form.id}`;
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[19px] font-semibold tracking-tight text-fg">{form.name}</h1>{a.open ? <Badge tone="green" dot>Accepting</Badge> : <Badge tone="amber" dot>{a.reason?.replace(/_/g, " ")}</Badge>}</div>
          <div className="mt-1 flex items-center gap-1"><code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-fg-muted">{endpoint}</code><CopyButton value={endpoint} label="Copy endpoint URL" /></div>
        </div>
        <ButtonLink href={`/f/${form.id}`} size="sm" target="_blank"><ExternalLink size={13} />Hosted form</ButtonLink>
      </div>
      <FormTabs id={form.id} />
      <div className="pt-4">{children}</div>
    </div>
  );
}
