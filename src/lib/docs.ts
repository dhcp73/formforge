import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { publicUrl } from "./enrich/pipeline";
export { DOCS_NAV, ALL_DOCS } from "./docs-nav";


const root = () => path.join(process.cwd(), "content", "docs");
const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function loadDoc(slug: string) {
  const safe = slug.split("/").filter((p) => /^[a-z0-9-]+$/.test(p)).join("/");
  if (safe !== slug) return null;
  const candidates = [path.join(root(), `${slug || "index"}.md`), path.join(root(), slug, "index.md")];
  const file = candidates.find((f) => f.startsWith(root()) && fs.existsSync(f));
  if (!file) return null;
  const md = fs.readFileSync(file, "utf8").replaceAll("{{BASE}}", publicUrl());
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? "Docs";
  const toc: { id: string; text: string }[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${id}">${text}</h${depth}>`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href);
        return `<a href="${href}"${title ? ` title="${title}"` : ""}${ext ? ' target="_blank" rel="noreferrer"' : ""}>${text}</a>`;
      },
      table(token) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const body = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      },
    },
  });
  const html = marked.parse(md.replace(/^#\s+.+$/m, ""), { async: false }) as string;
  return { title, html, toc, file: path.relative(process.cwd(), file) };
}
