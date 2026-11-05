"use client";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center" role="alert">
      <AlertTriangle size={32} className="text-amber-500" />
      <h1 className="mt-3 text-[17px] font-semibold text-fg">Something went wrong</h1>
      <p className="mt-1 text-[13px] text-fg-subtle">{error.message || "An unexpected error occurred."}{error.digest ? ` (ref ${error.digest})` : ""}</p>
      <div className="mt-5 flex gap-2"><Button onClick={reset} variant="primary">Try again</Button><ButtonLink href="/dashboard">Back to overview</ButtonLink></div>
    </div>
  );
}
