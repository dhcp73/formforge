import type { ListQuery } from "./submissions";
export function queryFromUrl(url: URL): ListQuery {
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const spam = g("spam");
  return {
    q: g("q"), spam: spam === "true" || spam === "all" ? spam : "false", status: g("status"), owner: g("owner"), tag: g("tag"),
    since: g("since"), until: g("until"), minFit: g("min_fit") ? Number(g("min_fit")) : undefined,
    page: g("page") ? Number(g("page")) : undefined, limit: g("limit") ? Number(g("limit")) : undefined,
    sort: g("sort") as ListQuery["sort"], order: g("order") as ListQuery["order"], formId: g("form_id"),
  };
}
