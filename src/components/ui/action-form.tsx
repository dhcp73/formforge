"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Label } from "./primitives";
import { cn } from "@/lib/cn";

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const Ctx = React.createContext<ActionState>(null);
export const useActionResult = () => React.useContext(Ctx);

export function ActionForm({ action, children, className, onDone, resetOnSuccess, id }: { action: Action; children: React.ReactNode; className?: string; onDone?: (s: ActionState) => void; resetOnSuccess?: boolean; id?: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onDone?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Ctx.Provider value={state}>
      <form ref={ref} action={formAction} className={className} noValidate id={id}>{children}</form>
    </Ctx.Provider>
  );
}

export function FormMessage({ className }: { className?: string }) {
  const s = useActionResult();
  if (!s || (!s.error && !s.message)) return null;
  return (
    <div role={s.error ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px]", s.error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300", className)}>
      {s.error ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
      <span>{s.error ?? s.message}</span>
    </div>
  );
}

export function Field({ name, label, hint, children, className }: { name: string; label: React.ReactNode; hint?: React.ReactNode; children: React.ReactElement<{ id?: string; name?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>; className?: string }) {
  const s = useActionResult();
  const err = s?.fieldErrors?.[name];
  const id = `f-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  // Client-component children coming from a server component can arrive as lazy elements without props;
  // in that case render them as-is (they receive id/name explicitly from the caller).
  const canClone = React.isValidElement(children) && children.props != null;
  const child = canClone
    ? React.cloneElement(children, { id, name: children.props.name ?? name, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-err` : hint ? `${id}-hint` : undefined })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {child}
      {err ? <p id={`${id}-err`} className="text-[12px] text-red-600 dark:text-red-400">{err}</p> : hint ? <p id={`${id}-hint`} className="text-[12px] text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, pendingText, ...p }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || p.disabled} {...p}>
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}
