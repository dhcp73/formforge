"use client";
import * as React from "react";
import { CalendarDays, Mail, Unplug, ExternalLink } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Badge } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import type { ActionState } from "@/components/ui/action-form";

type AppView = { provider: string; configured: boolean; source: "workspace" | "env" | null; clientId: string; tenant?: string };
type ConnView = { provider: string; accountEmail: string; connected: boolean; expiresAt: string | null; updatedAt: string };

export function CalendarConnectCard({
  provider, label, description, docs, redirectUri, app, connection, save, disconnect,
}: {
  provider: "google" | "microsoft";
  label: string;
  description: string;
  docs: string;
  redirectUri: string;
  app: AppView;
  connection: ConnView | null;
  save: (s: ActionState, fd: FormData) => Promise<ActionState>;
  disconnect: () => Promise<ActionState>;
}) {
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm" data-testid={`calendar-${provider}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-fg"><CalendarDays size={18} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold text-fg">{label}</h3>
              {app.configured ? <Badge tone="emerald">App configured</Badge> : <Badge tone="amber">Not configured</Badge>}
              {connection?.connected && <Badge tone="indigo">Connected · {connection.accountEmail}</Badge>}
            </div>
            <p className="mt-1 text-[12.5px] text-fg-muted">{description}</p>
            <p className="mt-1 text-[11.5px] text-fg-subtle">Redirect URI to register: <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[11px]">{redirectUri}</code></p>
          </div>
        </div>
        <a href={docs} className="text-[12px] text-accent hover:underline inline-flex items-center gap-1">Docs <ExternalLink size={11} /></a>
      </div>

      <ActionForm action={save} className="mt-4 space-y-3 border-t border-line pt-4">
        <FormMessage />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="clientId" label="Client ID"><Input name="clientId" defaultValue={app.clientId.includes("••••") ? "" : app.clientId} placeholder="OAuth client ID" className="font-mono text-[12px]" /></Field>
          <Field name="clientSecret" label="Client secret"><Input name="clientSecret" type="password" placeholder={app.configured ? "•••••••• (unchanged)" : "OAuth client secret"} className="font-mono text-[12px]" /></Field>
        </div>
        {provider === "microsoft" && (
          <Field name="tenant" label="Tenant" hint="Use common for multi-tenant, or your directory ID.">
            <Input name="tenant" defaultValue={app.tenant ?? "common"} className="font-mono text-[12px]" />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Save app credentials</SubmitButton>
          {app.configured ? (
            <ButtonLink href={`/api/oauth/${provider}/start`} variant="primary" size="sm">
              <Mail size={13} />Connect {label}
            </ButtonLink>
          ) : (
            <Button size="sm" disabled title="Save client ID and secret first">Connect {label}</Button>
          )}
          {connection?.connected && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await disconnect(); setMsg(r.error ?? r.message ?? null); })}>
              <Unplug size={13} />Disconnect
            </Button>
          )}
        </div>
        {msg && <p className="text-[12.5px] text-fg-muted">{msg}</p>}
        {!app.configured && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Not configured — set <code className="font-mono">{provider === "google" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT"}</code> in the environment, or paste them above.
          </p>
        )}
      </ActionForm>
    </div>
  );
}
