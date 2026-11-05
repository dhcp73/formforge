import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { listForms } from "@/lib/forms";
import { AppShell } from "@/components/app/shell";
export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · FormForge" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const forms = listForms(s.workspace.id).map((f) => ({ id: f.id, name: f.name }));
  return (
    <AppShell user={{ name: s.user.name, email: s.user.email }} workspace={{ id: s.workspace.id, name: s.workspace.name }} workspaces={s.workspaces.map((w) => ({ id: w.id, name: w.name }))} forms={forms}>
      {children}
    </AppShell>
  );
}
