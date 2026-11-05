"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/api", label: "API" },
  { href: "/changelog", label: "Changelog" },
  { href: "/status", label: "Status" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = React.useState(false);
  const path = usePathname();
  React.useEffect(() => setOpen(false), [path]);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-md px-2.5 py-1.5 text-[13.5px] text-fg-muted hover:bg-muted hover:text-fg", path?.startsWith(n.href) && "text-fg")}>{n.label}</Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {signedIn ? <ButtonLink href="/dashboard" variant="primary">Open dashboard</ButtonLink> : <>
            <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
            <ButtonLink href="/signup" variant="primary">Start free</ButtonLink>
          </>}
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-md p-2 text-fg-muted hover:bg-muted">
            {open ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-panel px-4 pb-4 pt-2 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-md px-2 py-2.5 text-[14px] text-fg hover:bg-muted">{n.label}</Link>)}
          </nav>
          <div className="mt-3 flex gap-2">
            {signedIn ? <ButtonLink href="/dashboard" variant="primary" className="flex-1">Open dashboard</ButtonLink> : <>
              <ButtonLink href="/login" className="flex-1">Log in</ButtonLink>
              <ButtonLink href="/signup" variant="primary" className="flex-1">Start free</ButtonLink>
            </>}
          </div>
        </div>
      )}
    </header>
  );
}
