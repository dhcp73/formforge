"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

const KEY = "formforge.demo.snapshot.v1";

/** In browser storage mode: restore localStorage snapshot on load, save periodically. */
export function DemoPersistence({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let interval = 0;
    (async () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const r = await fetch("/api/demo/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
          if (r.ok && !cancelled) router.refresh();
        }
      } catch { /* ignore */ }
      const save = async () => {
        if (cancelled) return;
        try {
          const r = await fetch("/api/demo/snapshot");
          if (!r.ok) return;
          const j = await r.json();
          localStorage.setItem(KEY, JSON.stringify(j));
        } catch { /* ignore */ }
      };
      await save();
      interval = window.setInterval(save, 15_000);
      const onHide = () => { void save(); };
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("formforge:demo-save", onHide);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("formforge:demo-save", onHide);
      };
    })();
    return () => { cancelled = true; if (interval) window.clearInterval(interval); };
  }, [enabled, router]);
  return null;
}

export function requestDemoSave() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("formforge:demo-save"));
}

export function DemoBanner({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div role="status" data-testid="demo-banner" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[12.5px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
      {label}
    </div>
  );
}
