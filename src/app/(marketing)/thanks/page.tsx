import type { Metadata } from "next";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
export const metadata: Metadata = { title: "Submission received", robots: { index: false } };

export default async function Thanks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const back = sp.back && /^https?:\/\//.test(sp.back) ? sp.back : null;
  const error = sp.error;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      {error ? <AlertTriangle size={40} className="text-amber-500" /> : <CheckCircle2 size={40} className="text-emerald-500" />}
      <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-fg">{error ? "We couldn't accept that submission" : "Thanks — we got it!"}</h1>
      <p className="mt-2 text-[14px] text-fg-muted">{error ? error : "Your submission was received successfully."}</p>
      {sp.details && <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{sp.details}</p>}
      <div className="mt-6 flex gap-3">
        {back && <a href={back} className="inline-flex h-8 items-center rounded-md border border-line bg-panel px-3 text-[13px] font-medium text-fg hover:bg-subtle">Go back</a>}
        <ButtonLink href="/" variant="primary">FormForge home</ButtonLink>
      </div>
      <p className="mt-10 text-[12px] text-fg-subtle">Powered by FormForge</p>
    </div>
  );
}
