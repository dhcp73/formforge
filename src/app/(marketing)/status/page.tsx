import type { Metadata } from "next";
import { statusSummary } from "@/lib/monitor";
import { StatusBoard } from "@/components/status-board";
export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function StatusPage() {
  const summary = statusSummary();
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-[30px] font-semibold tracking-tight text-fg">System status</h1>
      <p className="mt-2 text-[14px] text-fg-muted">Live results from FormForge&apos;s continuous health monitor. Machine-readable: <a className="font-mono text-accent underline underline-offset-2" href="/api/health/ready">/api/health/ready</a></p>
      <div className="mt-8"><StatusBoard summary={summary} /></div>
    </div>
  );
}
