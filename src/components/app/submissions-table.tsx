"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef, type ColumnOrderState, type VisibilityState, flexRender, getCoreRowModel, useReactTable, type RowSelectionState, type ColumnSizingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search, X, Bookmark, ShieldAlert, ShieldCheck, Archive, Trash2, MailOpen, ChevronUp, ChevronDown, Inbox, Loader2 } from "lucide-react";
import type { TableRow } from "@/lib/table-rows";
import { Badge, EmptyState, Select, Input } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { Menu, MenuCheckbox, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Modal } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import { bulkSubmissionsAction } from "@/app/dashboard/actions";

const SRC_TONE: Record<string, "indigo" | "amber" | "violet" | "gray" | "blue" | "green"> = { apollo: "indigo", clay: "amber", valyu: "violet", offline: "gray", ipgeo: "blue", ai: "green" };
const SRC_LABEL: Record<string, string> = { apollo: "Apollo", clay: "Clay", valyu: "Valyu", offline: "Offline", ipgeo: "Geo", ai: "AI" };

function rel(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

type View = { name: string; query: string; columns: VisibilityState; order: ColumnOrderState };

export function SubmissionsTable({ rows, dataColumns, total, page, totalPages, limit, owners, tableId, showForm, exportHref }: {
  rows: TableRow[]; dataColumns: string[]; total: number; page: number; totalPages: number; limit: number; owners: string[]; tableId: string; showForm?: boolean; exportHref?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [msg, setMsg] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const storageKey = `ff-table-${tableId}`;
  const [visibility, setVisibility] = React.useState<VisibilityState>({});
  const [order, setOrder] = React.useState<ColumnOrderState>([]);
  const [sizing, setSizing] = React.useState<ColumnSizingState>({});
  const [views, setViews] = React.useState<View[]>([]);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (raw.visibility) setVisibility(raw.visibility); if (raw.order) setOrder(raw.order); if (raw.sizing) setSizing(raw.sizing);
      setViews(JSON.parse(localStorage.getItem("ff-views") ?? "[]").filter((v: View & { table: string }) => v.table === tableId));
    } catch { /* ignore */ }
    loaded.current = true;
  }, [storageKey, tableId]);
  React.useEffect(() => { if (loaded.current) localStorage.setItem(storageKey, JSON.stringify({ visibility, order, sizing })); }, [visibility, order, sizing, storageKey]);
  React.useEffect(() => { setSelection({}); }, [rows]);

  const setParams = React.useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") p.delete(k); else p.set(k, v); }
    if (!("page" in patch)) p.delete("page");
    startTransition(() => router.push(`${path}${p.size ? `?${p}` : ""}`, { scroll: false }));
  }, [sp, path, router]);

  React.useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) setParams({ q: q || null }); }, 300);
    return () => clearTimeout(t);
  }, [q, sp, setParams]);

  const openRow = (id: string) => { const p = new URLSearchParams(sp.toString()); p.set("s", id); router.push(`${path}?${p}`, { scroll: false }); };

  const columns = React.useMemo<ColumnDef<TableRow>[]>(() => {
    const cols: ColumnDef<TableRow>[] = [
      { id: "select", size: 36, enableResizing: false, enableHiding: false,
        header: ({ table }) => <input type="checkbox" aria-label="Select all rows" className="h-3.5 w-3.5 accent-[var(--accent)]" checked={table.getIsAllRowsSelected()} ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} />,
        cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.name}`} className="h-3.5 w-3.5 accent-[var(--accent)]" checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onChange={row.getToggleSelectedHandler()} /> },
      { id: "name", header: "Lead", size: 220, enableHiding: false,
        cell: ({ row: { original: r } }) => (
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.domain ? <img src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=32`} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-sm" loading="lazy" /> : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-fg-subtle">{r.name.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0"><div className={cn("truncate font-medium text-fg", r.status === "new" && "font-semibold")}>{r.name}</div>{r.email && r.email !== r.name && <div className="truncate text-[11.5px] text-fg-subtle">{r.email}</div>}</div>
          </div>
        ) },
    ];
    if (showForm) cols.push({ id: "form", header: "Form", size: 140, cell: ({ row }) => <span className="truncate text-fg-muted">{row.original.formName}</span> });
    cols.push(
      { id: "company", header: "Company", size: 160, cell: ({ row: { original: r } }) => <span className="truncate text-fg">{r.company ?? <span className="text-fg-subtle">—</span>}</span> },
      { id: "fit", header: "Fit", size: 70, cell: ({ row: { original: r } }) => r.fitScore == null ? <span className="text-fg-subtle">—</span> : <Badge tone={r.fitScore >= 75 ? "green" : r.fitScore >= 50 ? "amber" : "gray"}>{r.fitScore}</Badge> },
      { id: "owner", header: "Owner", size: 130, cell: ({ row: { original: r } }) => <span className="truncate text-fg-muted">{r.owner ?? "Unassigned"}</span> },
      { id: "sources", header: "Enriched by", size: 150, cell: ({ row: { original: r } }) => <div className="flex gap-1 overflow-hidden">{r.sources.length ? r.sources.map((s) => <Badge key={s} tone={SRC_TONE[s] ?? "gray"}>{SRC_LABEL[s] ?? s}</Badge>) : <span className="text-fg-subtle">{r.enrichmentStatus === "pending" ? "Pending…" : "—"}</span>}</div> },
      { id: "country", header: "Country", size: 80, cell: ({ row }) => <span className="text-fg-muted">{row.original.country ?? "—"}</span> },
      { id: "employees", header: "Employees", size: 100, cell: ({ row }) => <span className="tabular-nums text-fg-muted">{row.original.employees?.toLocaleString() ?? "—"}</span> },
      { id: "industry", header: "Industry", size: 140, cell: ({ row }) => <span className="truncate text-fg-muted">{row.original.industry ?? "—"}</span> },
      { id: "tags", header: "Tags", size: 140, cell: ({ row }) => <div className="flex gap-1 overflow-hidden">{row.original.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> },
      ...dataColumns.map<ColumnDef<TableRow>>((k) => ({ id: `data.${k}`, header: k, size: 160, cell: ({ row }) => <span className="block truncate text-fg-muted" title={row.original.data[k]}>{row.original.data[k] ?? ""}</span> })),
      { id: "spam", header: "Spam", size: 80, cell: ({ row: { original: r } }) => <Badge tone={r.isSpam ? "red" : r.spamScore >= 30 ? "amber" : "gray"}>{r.spamScore}</Badge> },
      { id: "status", header: "Status", size: 90, cell: ({ row: { original: r } }) => <Badge tone={r.status === "new" ? "blue" : r.status === "archived" ? "gray" : "green"} dot>{r.status}</Badge> },
      { id: "created", header: "Received", size: 110, cell: ({ row }) => <time dateTime={row.original.createdAt} className="text-fg-subtle" title={new Date(row.original.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}>{rel(row.original.createdAt)}</time> },
    );
    return cols;
  }, [dataColumns, showForm]);

  const defaultHidden = React.useMemo(() => { const h: VisibilityState = { employees: false, industry: false, tags: false }; dataColumns.forEach((k, i) => { if (i >= 3) h[`data.${k}`] = false; }); return h; }, [dataColumns]);
  const table = useReactTable({
    data: rows, columns, getRowId: (r) => r.id, getCoreRowModel: getCoreRowModel(), columnResizeMode: "onChange", enableRowSelection: true,
    state: { rowSelection: selection, columnVisibility: { ...defaultHidden, ...visibility }, columnOrder: order, columnSizing: sizing },
    onRowSelectionChange: setSelection, onColumnVisibilityChange: (u) => setVisibility((v) => (typeof u === "function" ? u({ ...defaultHidden, ...v }) : u)),
    onColumnOrderChange: setOrder, onColumnSizingChange: setSizing,
  });

  const move = (id: string, dir: -1 | 1) => {
    const ids = order.length ? [...order] : table.getAllLeafColumns().map((c) => c.id);
    const i = ids.indexOf(id); const j = i + dir;
    if (i < 0 || j < 1 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; setOrder(ids);
  };
  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const bulk = (action: Parameters<typeof bulkSubmissionsAction>[1]) => startTransition(async () => {
    const r = await bulkSubmissionsAction(selectedIds, action);
    setMsg(r?.message ?? r?.error ?? null); setSelection({}); router.refresh();
  });
  const exportSelected = () => {
    const picked = rows.filter((r) => selection[r.id]);
    const keys = Array.from(new Set(picked.flatMap((r) => Object.keys(r.data))));
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
    const csv = [["id", "created_at", ...keys, "company", "fit_score", "owner"].join(","), ...picked.map((r) => [r.id, r.createdAt, ...keys.map((k) => r.data[k]), r.company, r.fitScore, r.owner].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `submissions-selected.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const saveView = (name: string) => {
    const all = JSON.parse(localStorage.getItem("ff-views") ?? "[]") as (View & { table: string })[];
    const p = new URLSearchParams(sp.toString()); p.delete("s"); p.delete("page");
    const v = { table: tableId, name, query: p.toString(), columns: visibility, order };
    const next = [...all.filter((x) => !(x.table === tableId && x.name === name)), v];
    localStorage.setItem("ff-views", JSON.stringify(next)); setViews(next.filter((x) => x.table === tableId));
  };
  const applyView = (v: View) => { setVisibility(v.columns); setOrder(v.order); startTransition(() => router.push(`${path}${v.query ? `?${v.query}` : ""}`)); setQ(new URLSearchParams(v.query).get("q") ?? ""); };
  const deleteView = (name: string) => { const all = (JSON.parse(localStorage.getItem("ff-views") ?? "[]") as (View & { table: string })[]).filter((x) => !(x.table === tableId && x.name === name)); localStorage.setItem("ff-views", JSON.stringify(all)); setViews(all.filter((x) => x.table === tableId)); };

  const spam = sp.get("spam") ?? "false";
  const sort = sp.get("sort") ?? "created_at"; const ord = sp.get("order") ?? "desc";
  const chips: [string, string][] = [];
  if (sp.get("q")) chips.push(["q", `Search: ${sp.get("q")}`]);
  if (sp.get("status")) chips.push(["status", `Status: ${sp.get("status")}`]);
  if (sp.get("owner")) chips.push(["owner", `Owner: ${sp.get("owner")}`]);
  if (sp.get("minFit")) chips.push(["minFit", `Fit ≥ ${sp.get("minFit")}`]);
  if (sp.get("tag")) chips.push(["tag", `Tag: ${sp.get("tag")}`]);

  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
        <div role="tablist" aria-label="Submission folders" className="flex rounded-md bg-muted p-0.5">
          {[["false", "Inbox"], ["true", "Spam"], ["all", "All"]].map(([v, l]) => (
            <button key={v} role="tab" type="button" aria-selected={spam === v} onClick={() => setParams({ spam: v === "false" ? null : v })} className={cn("rounded px-2.5 py-1 text-[12.5px] font-medium", spam === v ? "bg-panel text-fg shadow-sm" : "text-fg-subtle hover:text-fg")}>{l}</button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input aria-label="Search submissions" placeholder="Search name, email, company…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" data-testid="table-search" />
        </div>
        <Select aria-label="Filter by status" value={sp.get("status") ?? ""} onChange={(e) => setParams({ status: e.target.value || null })} className="w-auto">
          <option value="">Any status</option><option value="new">New</option><option value="read">Read</option><option value="archived">Archived</option>
        </Select>
        <Select aria-label="Filter by owner" value={sp.get("owner") ?? ""} onChange={(e) => setParams({ owner: e.target.value || null })} className="w-auto max-w-[160px]">
          <option value="">Any owner</option>{owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select aria-label="Minimum fit score" value={sp.get("minFit") ?? ""} onChange={(e) => setParams({ minFit: e.target.value || null })} className="w-auto">
          <option value="">Any fit</option><option value="50">Fit ≥ 50</option><option value="75">Fit ≥ 75</option><option value="90">Fit ≥ 90</option>
        </Select>
        <Select aria-label="Sort by" value={`${sort}:${ord}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setParams({ sort: s === "created_at" ? null : s, order: o === "desc" ? null : o }); }} className="w-auto">
          <option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="fit_score:desc">Highest fit</option><option value="spam_score:desc">Highest spam score</option>
        </Select>
        <div className="ml-auto flex items-center gap-1.5">
          {pending && <Loader2 size={14} className="animate-spin text-fg-subtle" aria-label="Loading" />}
          <Menu>
            <MenuTrigger asChild><Button size="sm" aria-label="Saved views"><Bookmark size={13} />Views</Button></MenuTrigger>
            <MenuContent>
              <MenuLabel>Saved views</MenuLabel>
              {views.length === 0 && <div className="px-2 py-1.5 text-[12px] text-fg-subtle">No saved views yet</div>}
              {views.map((v) => <MenuItem key={v.name} onSelect={() => applyView(v)}><span className="flex-1">{v.name}</span><span role="button" tabIndex={-1} aria-label={`Delete view ${v.name}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); deleteView(v.name); }} className="text-fg-subtle hover:text-red-600"><X size={12} /></span></MenuItem>)}
              <MenuSeparator /><MenuItem onSelect={() => setSaveOpen(true)}>Save current view…</MenuItem>
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild><Button size="sm" aria-label="Choose columns" data-testid="column-picker"><Columns3 size={13} />Columns</Button></MenuTrigger>
            <MenuContent className="max-h-80 overflow-y-auto">
              <MenuLabel>Show, hide & reorder</MenuLabel>
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <div key={c.id} className="flex items-center">
                  <MenuCheckbox className="flex-1" checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>{typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}</MenuCheckbox>
                  <button type="button" aria-label={`Move ${c.id} left`} onClick={() => move(c.id, -1)} className="rounded p-1 text-fg-subtle hover:bg-muted hover:text-fg"><ChevronUp size={12} /></button>
                  <button type="button" aria-label={`Move ${c.id} right`} onClick={() => move(c.id, 1)} className="rounded p-1 text-fg-subtle hover:bg-muted hover:text-fg"><ChevronDown size={12} /></button>
                </div>
              ))}
              <MenuSeparator /><MenuItem onSelect={() => { setVisibility({}); setOrder([]); setSizing({}); }}>Reset columns</MenuItem>
            </MenuContent>
          </Menu>
          {exportHref && <ButtonLink size="sm" href={`${exportHref}${spam !== "false" ? `?spam=${spam}` : ""}`}><Download size={13} />Export</ButtonLink>}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
          {chips.map(([k, l]) => <button key={k} type="button" onClick={() => { if (k === "q") setQ(""); setParams({ [k]: null }); }} className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle px-2 py-0.5 text-[12px] text-fg-muted hover:border-line-strong" aria-label={`Remove filter ${l}`}>{l}<X size={11} /></button>)}
          <button type="button" onClick={() => { setQ(""); startTransition(() => router.push(path)); }} className="text-[12px] text-accent hover:underline">Clear all</button>
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-accent-soft/50 px-2 py-1.5 text-[12.5px]" role="toolbar" aria-label="Bulk actions">
          <span className="mr-1 font-medium text-fg">{selectedIds.length} selected</span>
          <Button size="sm" onClick={() => bulk("read")}><MailOpen size={13} />Mark read</Button>
          {spam === "true" ? <Button size="sm" onClick={() => bulk("not_spam")}><ShieldCheck size={13} />Not spam</Button> : <Button size="sm" onClick={() => bulk("spam")}><ShieldAlert size={13} />Spam</Button>}
          <Button size="sm" onClick={() => bulk("archived")}><Archive size={13} />Archive</Button>
          <Button size="sm" onClick={exportSelected}><Download size={13} />Export CSV</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Delete</Button>
        </div>
      )}
      {msg && <p role="status" className="border-b border-line px-3 py-1.5 text-[12px] text-fg-muted">{msg}</p>}
      <div className={cn("scrollbar-thin relative max-h-[calc(100vh-280px)] min-h-[200px] overflow-auto transition-opacity", pending && "opacity-60")}>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox size={16} />} title={chips.length ? "No submissions match these filters" : spam === "true" ? "No spam — nice" : "No submissions yet"} description={chips.length ? "Try removing a filter." : "Submissions appear here as soon as your form posts to the endpoint."} />
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth: table.getTotalSize() }} data-testid="submissions-table">
            <thead className="sticky top-0 z-10 bg-subtle">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} style={{ width: h.getSize() }} className="relative whitespace-nowrap border-b border-line px-2.5 py-1.5 text-left text-[11.5px] font-medium text-fg-subtle">
                      {h.isPlaceholder ? null : (
                        h.column.id === "fit" || h.column.id === "spam" || h.column.id === "created" ? (
                          <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => { const key = h.column.id === "fit" ? "fit_score" : h.column.id === "spam" ? "spam_score" : "created_at"; const next = sort === key && ord === "desc" ? "asc" : "desc"; setParams({ sort: key === "created_at" ? null : key, order: next === "desc" ? null : next }); }}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {((h.column.id === "fit" && sort === "fit_score") || (h.column.id === "spam" && sort === "spam_score") || (h.column.id === "created" && sort === "created_at")) && (ord === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                          </button>
                        ) : <span className="block truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      )}
                      {h.column.getCanResize() && <div onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()} onDoubleClick={() => h.column.resetSize()} aria-hidden className={cn("absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-accent/50", h.column.getIsResizing() && "bg-accent")} />}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id} onClick={() => openRow(r.id)} onKeyDown={(e) => { if (e.key === "Enter") openRow(r.id); }} tabIndex={0} aria-label={`Open ${r.original.name}`} data-state={r.getIsSelected() ? "selected" : undefined}
                  className={cn("cursor-pointer outline-none hover:bg-subtle focus-visible:bg-accent-soft/60 data-[state=selected]:bg-accent-soft/50", sp.get("s") === r.id && "bg-accent-soft/40")}>
                  {r.getVisibleCells().map((c) => <td key={c.id} style={{ width: c.column.getSize(), maxWidth: c.column.getSize() }} className="overflow-hidden border-b border-line px-2.5 py-1.5 align-middle">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12.5px] text-fg-subtle">
        <span>{total === 0 ? "0 results" : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total.toLocaleString()}`}</span>
        <div className="flex items-center gap-1.5">
          <Select aria-label="Rows per page" value={String(limit)} onChange={(e) => setParams({ limit: e.target.value === "25" ? null : e.target.value })} className="h-7 w-auto">
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </Select>
          <Button size="sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}><ChevronLeft size={14} /></Button>
          <span className="tabular-nums">Page {page} of {totalPages}</span>
          <Button size="sm" variant="ghost" aria-label="Next page" disabled={page >= totalPages} onClick={() => setParams({ page: String(page + 1) })}><ChevronRight size={14} /></Button>
        </div>
      </div>
      <Modal open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${selectedIds.length} submissions?`} description="This permanently deletes the selected submissions and their files.">
        <div className="flex justify-end gap-2"><Button onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={() => { setConfirmDelete(false); bulk("delete"); }}>Delete</Button></div>
      </Modal>
      <Modal open={saveOpen} onOpenChange={setSaveOpen} title="Save view" description="Saves current filters, sort and columns in this browser.">
        <form onSubmit={(e) => { e.preventDefault(); const n = String(new FormData(e.currentTarget).get("name") ?? "").trim(); if (!n) return; saveView(n); setSaveOpen(false); }} className="space-y-3">
          <label htmlFor="view-name" className="text-[12.5px] font-medium text-fg">View name</label>
          <Input id="view-name" name="name" required minLength={1} maxLength={40} placeholder="Hot leads" autoFocus />
          <div className="flex justify-end gap-2"><Button onClick={() => setSaveOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save view</Button></div>
        </form>
      </Modal>
    </div>
  );
}

export function TableLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href}>{children}</Link>; }
