import { requireSession } from "@/lib/session";
import { listForms } from "@/lib/forms";
import { listSubmissions, distinctOwners, getSubmission, parseListParams } from "@/lib/submissions";
import { toTableRow } from "@/lib/table-rows";
import { SubmissionsTable } from "@/components/app/submissions-table";
import { RecordDrawer } from "@/components/app/record-ui";
import { RecordView } from "@/components/app/record-view";
import { PageHeader } from "@/components/ui/primitives";
import { displayName } from "@/lib/format";
export const metadata = { title: "Leads" };

export default async function Leads({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const forms = new Map(listForms(s.workspace.id).map((f) => [f.id, f.name]));
  const res = listSubmissions(s.workspace.id, parseListParams(sp));
  const open = typeof sp.s === "string" ? getSubmission(s.workspace.id, sp.s) : null;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Leads" description="Every submission across all forms, enriched and routed." />
      <SubmissionsTable tableId="leads" showForm rows={res.data.map((r) => toTableRow(r, forms.get(r.formId)))} dataColumns={[]} total={res.total} page={res.page} totalPages={res.totalPages} limit={res.limit} owners={distinctOwners(s.workspace.id)} />
      {open && <RecordDrawer title={displayName(open)} fullHref={`/dashboard/submissions/${open.id}`}><RecordView s={open} formName={forms.get(open.formId) ?? ""} afterDelete="/dashboard/leads" /></RecordDrawer>}
    </div>
  );
}
