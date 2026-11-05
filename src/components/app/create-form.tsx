"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton, type ActionState } from "@/components/ui/action-form";
import { createFormAction } from "@/app/dashboard/actions";

const SNAP_KEY = "formforge.demo.snapshot.v1";

function mergeFormIntoLocalSnapshot(formRow: Record<string, unknown>) {
  let snap: { v?: number; tables?: Record<string, Array<Record<string, unknown>>> } = { v: 1, tables: {} };
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (raw) snap = JSON.parse(raw);
  } catch { /* ignore */ }
  snap.tables = snap.tables ?? {};
  const forms = Array.isArray(snap.tables.forms) ? snap.tables.forms.filter((f) => f.id !== formRow.id) : [];
  forms.push(formRow);
  snap.tables.forms = forms;
  snap.v = 1;
  localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  return snap;
}

export function CreateFormButton({ label = "New form" }: { label?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (sp.get("new") === "1") setOpen(true); }, [sp]);
  const onOpenChange = (o: boolean) => { setOpen(o); if (!o && sp.get("new")) router.replace("/dashboard/forms"); };
  const onDone = async (s: ActionState) => {
    const id = s?.data?.id;
    const formRow = s?.data?.form as Record<string, unknown> | undefined;
    if (!s?.ok || typeof id !== "string") return;
    if (formRow) {
      const snap = mergeFormIntoLocalSnapshot(formRow);
      try {
        await fetch("/api/demo/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap) });
      } catch { /* ignore */ }
    }
    setOpen(false);
    router.push(`/dashboard/forms/${id}/setup?created=1`);
    router.refresh();
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create a form" description="You'll get a public endpoint immediately. Every field is accepted — add a schema later."
      trigger={<Button variant="primary" data-testid="new-form"><Plus size={14} />{label}</Button>}>
      <ActionForm action={createFormAction} className="space-y-4" onDone={onDone}>
        <FormMessage />
        <Field name="name" label="Form name"><Input placeholder="Contact sales" autoFocus /></Field>
        <Field name="description" label="Description (optional)"><Textarea rows={2} placeholder="Website demo-request form" /></Field>
        <Field name="redirectUrl" label="Redirect after submit (optional)" hint="Leave empty to use the hosted thank-you page."><Input placeholder="https://example.com/thanks" /></Field>
        <Field name="notifyEmails" label="Email notifications (optional)" hint="Comma-separated."><Input placeholder="sales@example.com" /></Field>
        <div className="flex justify-end gap-2 pt-1"><Button onClick={() => onOpenChange(false)}>Cancel</Button><SubmitButton pendingText="Creating…">Create form</SubmitButton></div>
      </ActionForm>
    </Modal>
  );
}
