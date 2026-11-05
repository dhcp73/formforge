import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { DocsNav } from "@/components/docs-nav";
import { DocsMobileNav } from "@/components/docs-mobile-nav";
import { getSession } from "@/lib/session";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2">Skip to content</a>
      <SiteHeader signedIn={!!s} />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-56 shrink-0 py-8 lg:block"><div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2"><DocsNav /></div></aside>
        <main id="main" className="min-w-0 flex-1 py-8"><DocsMobileNav />{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
