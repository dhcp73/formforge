"use client";
import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Switch as Sw, Tooltip as T, Popover as P } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({ open, onOpenChange, title, description, children, trigger, className }: {
  open?: boolean; onOpenChange?: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; trigger?: React.ReactNode; className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <D.Content className={cn("animate-pop fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-panel p-5 shadow-pop focus:outline-none", className)}>
          <div className="mb-4 pr-8">
            <D.Title className="text-[15px] font-semibold text-fg">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[12.5px] text-fg-subtle">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {children}
          <D.Close aria-label="Close" className="absolute right-3 top-3 rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg"><X size={16} /></D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Sheet({ open, onOpenChange, title, children, width = "max-w-2xl", header }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode; width?: string; header?: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/30" />
        <D.Content className={cn("animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-panel shadow-pop focus:outline-none", width)}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <D.Title className="min-w-0 truncate text-[13.5px] font-semibold text-fg">{title}</D.Title>
            <div className="flex items-center gap-1">
              {header}
              <D.Close aria-label="Close panel" className="rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg"><X size={16} /></D.Close>
            </div>
          </div>
          <D.Description className="sr-only">{title} details</D.Description>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("animate-fade-in z-50 min-w-48 rounded-lg border border-line bg-panel p-1 shadow-pop", className)}>{children}</DM.Content>
    </DM.Portal>
  );
}
export function MenuItem({ className, ...p }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50", className)} {...p} />;
}
export function MenuCheckbox({ className, children, ...p }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-muted", className)} {...p}>
      <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border", p.checked ? "border-accent bg-accent text-white" : "border-line-strong")}>
        <DM.ItemIndicator><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12l5 5L20 7" /></svg></DM.ItemIndicator>
      </span>
      {children}
    </DM.CheckboxItem>
  );
}
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</DM.Label>;

export function Switch({ checked, onCheckedChange, name, id, disabled, label, defaultChecked }: { checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (v: boolean) => void; name?: string; id?: string; disabled?: boolean; label: string }) {
  return (
    <Sw.Root id={id} name={name} checked={checked} defaultChecked={defaultChecked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} value="on"
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50">
      <Sw.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  );
}

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-zinc-900 px-2 py-1 text-[12px] text-white shadow-pop dark:bg-zinc-100 dark:text-zinc-900">{content}</T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ children, className, align = "start" }: { children: React.ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn("animate-fade-in z-50 w-72 rounded-lg border border-line bg-panel p-3 shadow-pop focus:outline-none", className)}>{children}</P.Content>
    </P.Portal>
  );
}
