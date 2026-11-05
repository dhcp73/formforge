import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSession } from "@/lib/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2">Skip to content</a>
      <SiteHeader signedIn={!!s} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
