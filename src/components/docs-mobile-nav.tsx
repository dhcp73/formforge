"use client";
import * as React from "react";
import { Menu } from "lucide-react";
import { Sheet } from "@/components/ui/overlay";
import { DocsNav } from "./docs-nav";
export function DocsMobileNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mb-4 lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-[13px] text-fg-muted hover:text-fg"><Menu size={14} />Docs menu</button>
      <Sheet open={open} onOpenChange={setOpen} title="Documentation" width="max-w-xs"><div className="p-4"><DocsNav onNavigate={() => setOpen(false)} /></div></Sheet>
    </div>
  );
}
