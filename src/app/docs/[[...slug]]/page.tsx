import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadDoc, ALL_DOCS } from "@/lib/docs";

export function generateStaticParams() { return ALL_DOCS.map((d) => ({ slug: d.slug ? d.slug.split("/") : [] })); }
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const d = loadDoc(((await params).slug ?? []).join("/"));
  return { title: d ? `${d.title} · Docs` : "Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = ((await params).slug ?? []).join("/");
  const doc = loadDoc(slug);
  if (!doc) notFound();
  const i = ALL_DOCS.findIndex((d) => d.slug === slug);
  const prev = ALL_DOCS[i - 1];
  const next = ALL_DOCS[i + 1];
  const href = (s: string) => `/docs${s ? `/${s}` : ""}`;
  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">{doc.title}</h1>
        <div className="prose prose-zinc prose-docs mt-4 max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <nav aria-label="Pagination" className="mt-12 flex justify-between gap-3 border-t border-line pt-6 text-[13px]">
          {prev ? <Link href={href(prev.slug)} className="group flex items-center gap-1 text-fg-muted hover:text-fg"><ChevronLeft size={14} />{prev.title}</Link> : <span />}
          {next ? <Link href={href(next.slug)} className="group flex items-center gap-1 text-fg-muted hover:text-fg">{next.title}<ChevronRight size={14} /></Link> : <span />}
        </nav>
      </article>
      {doc.toc.length > 1 && (
        <aside className="hidden w-48 shrink-0 xl:block">
          <div className="sticky top-24 text-[12.5px]"><p className="mb-2 font-semibold text-fg">On this page</p><ul className="space-y-1.5">{doc.toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-fg-subtle hover:text-fg">{t.text}</a></li>)}</ul></div>
        </aside>
      )}
    </div>
  );
}
