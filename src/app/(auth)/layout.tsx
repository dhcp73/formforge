import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6"><Logo /><ThemeToggle /></header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
      <footer className="py-6 text-center text-[12px] text-fg-subtle"><Link href="/docs" className="hover:text-fg">Docs</Link> · <Link href="/status" className="hover:text-fg">Status</Link> · <Link href="/pricing" className="hover:text-fg">Pricing</Link></footer>
    </div>
  );
}
