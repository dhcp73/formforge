"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ChevronsUpDown, PanelLeftClose, PanelLeft, Search, Menu as MenuIcon, LogOut, Plus, Check, Moon, Sun, FileText, X, User } from "lucide-react";
import { useTheme } from "next-themes";
import { NAV_GROUPS, CRUMB_LABELS } from "./nav";
import { LogoMark } from "@/components/logo";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel, Modal } from "@/components/ui/overlay";
import { Kbd, Input } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { switchWorkspaceAction, createWorkspaceAction } from "@/app/dashboard/actions";
import { logoutAction } from "@/app/(auth)/actions";

export interface ShellProps {
  user: { name: string; email: string };
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  forms: { id: string; name: string }[];
  children: React.ReactNode;
}

function initials(s: string) { return s.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }

function SidebarContent({ collapsed, workspace, workspaces, onNavigate, onCollapse }: { collapsed: boolean; workspace: ShellProps["workspace"]; workspaces: ShellProps["workspaces"]; onNavigate?: () => void; onCollapse?: () => void }) {
  const path = usePathname() ?? "";
  const [newWs, setNewWs] = React.useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 items-center gap-1 border-b border-line px-2", collapsed && "justify-center")}>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted", collapsed && "flex-none")}>
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-white">{initials(workspace.name)}</span>
              {collapsed && <span className="sr-only">{workspace.name}</span>}<span className="sr-only">, switch workspace</span>
              {!collapsed && <><span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{workspace.name}</span><ChevronsUpDown size={14} className="text-fg-subtle" /></>}
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-60">
            <MenuLabel>Workspaces</MenuLabel>
            {workspaces.map((w) => (
              <MenuItem key={w.id} onSelect={() => { void switchWorkspaceAction(w.id); }}>
                <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-semibold">{initials(w.name)}</span>
                <span className="flex-1 truncate">{w.name}</span>{w.id === workspace.id && <Check size={14} className="text-accent" />}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => setNewWs(true)}><Plus size={14} /> New workspace</MenuItem>
          </MenuContent>
        </Menu>
        {!collapsed && onCollapse && <button type="button" onClick={onCollapse} aria-label="Collapse sidebar" className="hidden rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg lg:inline-flex"><PanelLeftClose size={15} /></button>}
      </div>
      <nav aria-label="Dashboard" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            {!collapsed && <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{g.label}</p>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = "exact" in it && it.exact ? path === it.href : path.startsWith(it.href);
                return (
                  <li key={it.href}>
                    <Link href={it.href} onClick={onNavigate} title={collapsed ? it.label : undefined} aria-current={active ? "page" : undefined}
                      className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors", active ? "bg-muted font-medium text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg", collapsed && "justify-center px-0")}>
                      <it.icon size={15} className={active ? "text-accent" : ""} />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-line p-2 text-[11.5px] text-fg-subtle", collapsed && "hidden")}>
        <Link href="/status" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"><span className="h-2 w-2 rounded-full bg-emerald-500" />Status page</Link>
      </div>
      <Modal open={newWs} onOpenChange={setNewWs} title="New workspace" description="Workspaces keep forms, keys and integrations separate (e.g. per client).">
        <form action={async (fd) => { await createWorkspaceAction(fd); setNewWs(false); }} className="space-y-3">
          <label htmlFor="ws-name" className="text-[12.5px] font-medium text-fg">Name</label>
          <Input id="ws-name" name="name" required minLength={2} placeholder="Client — Northwind" />
          <div className="flex justify-end gap-2"><Button onClick={() => setNewWs(false)}>Cancel</Button><Button type="submit" variant="primary">Create workspace</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function CommandPalette({ open, setOpen, forms }: { open: boolean; setOpen: (o: boolean) => void; forms: ShellProps["forms"] }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette" overlayClassName="fixed inset-0 z-50 bg-black/40"
      contentClassName="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={15} className="text-fg-subtle" />
        <Command.Input placeholder="Search pages, forms and actions…" className="h-11 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-subtle">No results.</Command.Empty>
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-fg-subtle">
          <PaletteItem onSelect={() => go("/dashboard/forms?new=1")}><Plus size={14} />Create form</PaletteItem>
          <PaletteItem onSelect={() => go("/dashboard/api-keys?new=1")}><Plus size={14} />Create API key</PaletteItem>
          <PaletteItem onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false); }}>{resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}Toggle theme</PaletteItem>
        </Command.Group>
        <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-fg-subtle">
          {NAV_GROUPS.flatMap((g) => g.items).map((it) => <PaletteItem key={it.href} onSelect={() => go(it.href)}><it.icon size={14} />{it.label}</PaletteItem>)}
        </Command.Group>
        {forms.length > 0 && (
          <Command.Group heading="Forms" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-fg-subtle">
            {forms.map((f) => <PaletteItem key={f.id} value={`form ${f.name} ${f.id}`} onSelect={() => go(`/dashboard/forms/${f.id}`)}><FileText size={14} />{f.name}<span className="ml-auto font-mono text-[11px] text-fg-subtle">{f.id}</span></PaletteItem>)}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
function PaletteItem({ children, onSelect, value }: { children: React.ReactNode; onSelect: () => void; value?: string }) {
  return <Command.Item value={value} onSelect={onSelect} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-fg data-[selected=true]:bg-muted">{children}</Command.Item>;
}

function Breadcrumbs({ forms }: { forms: ShellProps["forms"] }) {
  const path = usePathname() ?? "";
  const parts = path.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const form = forms.find((f) => f.id === p);
    const label = form?.name ?? CRUMB_LABELS[p] ?? (p.startsWith("sub_") ? p.slice(0, 12) + "…" : p);
    return { href, label };
  }).filter((c) => c.href !== "/dashboard/submissions");
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-fg-subtle">/</span>}
            {i === crumbs.length - 1 ? <span aria-current="page" className="truncate font-medium text-fg">{c.label}</span> : <Link href={c.href} className="truncate text-fg-subtle hover:text-fg">{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({ user, workspace, workspaces, forms, children }: ShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [palette, setPalette] = React.useState(false);
  const path = usePathname();
  React.useEffect(() => { setCollapsed(localStorage.getItem("ff-sidebar") === "1"); }, []);
  React.useEffect(() => setMobile(false), [path]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggle = () => { const v = !collapsed; setCollapsed(v); localStorage.setItem("ff-sidebar", v ? "1" : "0"); };

  return (
    <div className="flex min-h-screen bg-bg text-[13px]">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-panel focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-line bg-panel transition-[width] lg:block", collapsed ? "w-14" : "w-60")} aria-label="Sidebar">
        <SidebarContent collapsed={collapsed} workspace={workspace} workspaces={workspaces} onCollapse={toggle} />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-panel shadow-pop">
            <button type="button" onClick={() => setMobile(false)} aria-label="Close navigation" className="absolute right-2 top-2.5 z-10 rounded-md p-1.5 text-fg-subtle hover:bg-muted"><X size={16} /></button>
            <SidebarContent collapsed={false} workspace={workspace} workspaces={workspaces} onNavigate={() => setMobile(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-4">
          <button type="button" onClick={() => setMobile(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-fg-subtle hover:bg-muted lg:hidden"><MenuIcon size={17} /></button>
          {collapsed && <button type="button" onClick={toggle} aria-label="Expand sidebar" className="hidden rounded-md p-1.5 text-fg-subtle hover:bg-muted lg:inline-flex"><PanelLeft size={16} /></button>}
          <Link href="/dashboard" className="lg:hidden" aria-label="Dashboard home"><LogoMark size={22} /></Link>
          <div className="hidden min-w-0 flex-1 sm:block"><Breadcrumbs forms={forms} /></div>
          <div className="flex-1 sm:hidden" />
          <button type="button" onClick={() => setPalette(true)} data-testid="search-trigger"
            className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[12.5px] text-fg-subtle hover:border-line-strong sm:w-64">
            <Search size={14} aria-hidden="true" /><span className="sr-only sm:hidden">Search or jump to…</span><span className="hidden flex-1 text-left sm:inline">Search or jump to…</span><span className="hidden sm:inline"><Kbd>⌘K</Kbd></span>
          </button>
          <ThemeToggle />
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900"><span aria-hidden="true">{initials(user.name)}</span><span className="sr-only">User menu ({user.name})</span></button>
            </MenuTrigger>
            <MenuContent className="w-60">
              <div className="px-2 py-1.5"><div className="truncate text-[13px] font-medium text-fg">{user.name}</div><div className="truncate text-[12px] text-fg-subtle">{user.email}</div></div>
              <MenuSeparator />
              <MenuItem asChild><Link href="/dashboard/settings"><User size={14} />Account settings</Link></MenuItem>
              <MenuItem asChild><Link href="/docs"><FileText size={14} />Documentation</Link></MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => { void logoutAction(); }}><LogOut size={14} />Log out</MenuItem>
            </MenuContent>
          </Menu>
        </header>
        <main id="app-main" className="min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
      <CommandPalette open={palette} setOpen={setPalette} forms={forms} />
    </div>
  );
}
