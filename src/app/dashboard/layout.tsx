import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession, applyDemoSnapCookie } from "@/lib/session";
import { listForms } from "@/lib/forms";
import { AppShell } from "@/components/app/shell";
import { DemoBanner, DemoPersistence } from "@/components/app/demo-persistence";
import { demoModeLabel, isEphemeralMode, getDb } from "@/lib/db";
import { ensureDemoSeed } from "@/lib/storage/demo-seed";
export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · FormForge" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  getDb();
  if (isEphemeralMode()) {
    ensureDemoSeed();
    await applyDemoSnapCookie();
  }
  const s = await requireSession();
  const forms = listForms(s.workspace.id).map((f) => ({ id: f.id, name: f.name }));
  const label = demoModeLabel();
  return (
    <>
      <DemoBanner label={label} />
      <Suspense fallback={null}>
        <DemoPersistence enabled={isEphemeralMode()} />
      </Suspense>
      <AppShell user={{ name: s.user.name, email: s.user.email }} workspace={{ id: s.workspace.id, name: s.workspace.name }} workspaces={s.workspaces.map((w) => ({ id: w.id, name: w.name }))} forms={forms}>
        {children}
      </AppShell>
    </>
  );
}
