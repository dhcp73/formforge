import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getSubmission } from "@/lib/submissions";
import { getForm } from "@/lib/forms";
import { RecordView } from "@/components/app/record-view";
import { Card } from "@/components/ui/primitives";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const sub = getSubmission(s.workspace.id, id);
  if (!sub) notFound();
  const form = getForm(s.workspace.id, sub.formId);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/dashboard/forms/${sub.formId}`} className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-fg-subtle hover:text-fg"><ChevronLeft size={14} />Back to {form?.name ?? "form"}</Link>
      <Card className="overflow-hidden"><RecordView s={sub} formName={form?.name ?? ""} afterDelete={`/dashboard/forms/${sub.formId}`} /></Card>
    </div>
  );
}
