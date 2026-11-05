import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormPublic, formAvailability } from "@/lib/forms";
import { HostedForm } from "@/components/hosted-form";
import { LogoMark } from "@/components/logo";
import type { FieldDef } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEFAULT_FIELDS: FieldDef[] = [
  { name: "name", label: "Full name", type: "text", required: true },
  { name: "email", label: "Work email", type: "email", required: true },
  { name: "company", label: "Company", type: "text", required: false },
  { name: "message", label: "Message", type: "longtext", required: false },
];

export async function generateMetadata({ params }: { params: Promise<{ formId: string }> }): Promise<Metadata> {
  const f = getFormPublic((await params).formId);
  return { title: f ? f.name : "Form", robots: { index: false } };
}

export default async function HostedFormPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { formId } = await params;
  const embed = (await searchParams).embed === "1";
  const form = getFormPublic(formId);
  if (!form || form.workspaceId === "ws_system") notFound();
  const a = formAvailability(form);
  const fields = (form.settings.fields?.length ? form.settings.fields : DEFAULT_FIELDS);
  return (
    <main className={cn("min-h-screen bg-bg", !embed && "bg-grid px-4 py-10 sm:py-16")}>
      <div className={cn("mx-auto w-full", embed ? "p-4" : "max-w-lg rounded-xl border border-line bg-panel p-6 shadow-sm sm:p-8")}>
        <h1 className="text-[20px] font-semibold tracking-tight text-fg">{form.name}</h1>
        {form.description && <p className="mt-1 text-[13.5px] text-fg-muted">{form.description}</p>}
        <div className="mt-6">
          {a.open ? <HostedForm formId={form.id} fields={fields} honeypot={form.settings.honeypotField} /> : <p role="status" className="rounded-md border border-line bg-subtle p-4 text-[13.5px] text-fg-muted">{form.settings.closedMessage}</p>}
        </div>
      </div>
      {!embed && <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-fg-subtle"><LogoMark size={14} />Powered by <Link href="/" className="font-medium text-fg-muted hover:text-fg">FormForge</Link></p>}
    </main>
  );
}
