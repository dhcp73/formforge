"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
export function FormTabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/dashboard/forms/${id}`;
  const tabs = [[base, "Submissions"], [`${base}/setup`, "Setup"], [`${base}/settings`, "Settings"], [`${base}/automations`, "Automations"]];
  return (
    <nav aria-label="Form sections" className="scrollbar-thin -mb-px mt-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([href, label]) => {
        const active = href === base ? path === base : path.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium", active ? "border-accent text-fg" : "border-transparent text-fg-subtle hover:text-fg")}>{label}</Link>;
      })}
    </nav>
  );
}
