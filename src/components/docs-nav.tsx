"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DOCS_NAV } from "@/lib/docs-nav";

export function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Documentation" className="space-y-5 text-[13px]">
      {DOCS_NAV.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const href = `/docs${i.slug ? `/${i.slug}` : ""}`;
              const active = path === href;
              return <li key={href}><Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("block rounded-md px-2 py-1.5", active ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-muted hover:text-fg")}>{i.title}</Link></li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
