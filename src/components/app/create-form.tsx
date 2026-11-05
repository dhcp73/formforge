"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { createFormAction } from "@/app/dashboard/actions";

export function CreateFormButton({ label = "New form" }: { label?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (sp.get("new") === "1") setOpen(true); }, [sp]);
  const onOpenChange = (o: boolean) => { setOpen(o); if (!o && sp.get("new")) router.replace("/dashboard/forms"); };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create a form" description="You'll get a public endpoint immediately. Every field is accepted — add a schema later."
      trigger={<Button variant="primary" data-testid="new-form"><Plus size={14} />{label}</Button>}>
      <ActionForm action={createFormAction} className="space-y-4">
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
