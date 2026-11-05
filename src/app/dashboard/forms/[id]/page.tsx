import { requireSession } from "@/lib/session";
import { getForm } from "@/lib/forms";
import { listSubmissions, formColumns, distinctOwners, getSubmission, parseListParams } from "@/lib/submissions";
import { toTableRow } from "@/lib/table-rows";
import { SubmissionsTable } from "@/components/app/submissions-table";
import { RecordDrawer } from "@/components/app/record-ui";
import { RecordView } from "@/components/app/record-view";
import { displayName } from "@/lib/format";
import { notFound } from "next/navigation";

export default async function FormSubmissions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession();
  const form = getForm(s.workspace.id, id);
  if (!form) notFound();
  const q = parseListParams(sp);
  const res = listSubmissions(s.workspace.id, { ...q, formId: id });
  const open = typeof sp.s === "string" ? getSubmission(s.workspace.id, sp.s) : null;
  const reserved = new Set(["_subject", "_gotcha"]);
  return (
    <>
      <SubmissionsTable tableId={`form-${id}`} rows={res.data.map((r) => toTableRow(r))} dataColumns={formColumns(s.workspace.id, id).filter((k) => !reserved.has(k))} total={res.total} page={res.page} totalPages={res.totalPages} limit={res.limit} owners={distinctOwners(s.workspace.id, id)} exportHref={`/api/app/forms/${id}/export`} />
      {open && open.formId === id && (
        <RecordDrawer title={displayName(open)} fullHref={`/dashboard/submissions/${open.id}`}>
          <RecordView s={open} formName={form.name} afterDelete={`/dashboard/forms/${id}`} />
        </RecordDrawer>
      )}
    </>
  );
}
