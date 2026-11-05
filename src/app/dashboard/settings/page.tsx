import { requireSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { Card, CardHeader, Input, PageHeader, Badge } from "@/components/ui/primitives";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { saveProfileAction, saveWorkspaceAction, changePasswordAction } from "@/app/dashboard/actions";
import { ThemeToggle } from "@/components/ui/theme";
import { fmtDate } from "@/lib/format";
export const metadata = { title: "Settings" };

export default async function Settings() {
  const s = await requireSession();
  const members = getDb().prepare("SELECT u.name, u.email, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at").all(s.workspace.id) as { name: string; email: string; role: string; created_at: string }[];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" description="Your profile, workspace and security." />
      <Card id="profile">
        <CardHeader title="Profile" />
        <ActionForm action={saveProfileAction} className="space-y-4 p-4">
          <FormMessage />
          <Field name="name" label="Name"><Input defaultValue={s.user.name} /></Field>
          <div className="space-y-1.5"><p className="text-[12.5px] font-medium text-fg">Email</p><p className="text-[13px] text-fg-muted">{s.user.email}</p></div>
          <div className="flex items-center justify-between rounded-md border border-line p-3"><div><p className="text-[13px] font-medium text-fg">Appearance</p><p className="text-[12px] text-fg-subtle">Light or dark mode (also in ⌘K).</p></div><ThemeToggle /></div>
          <SubmitButton>Save profile</SubmitButton>
        </ActionForm>
      </Card>
      <Card id="workspace">
        <CardHeader title="Workspace" description={`ID ${s.workspace.id}`} />
        <ActionForm action={saveWorkspaceAction} className="space-y-4 p-4">
          <FormMessage />
          <Field name="workspaceName" label="Workspace name"><Input defaultValue={s.workspace.name} /></Field>
          <SubmitButton>Rename workspace</SubmitButton>
        </ActionForm>
        <div className="border-t border-line">
          <p className="px-4 pt-3 text-[12px] font-medium text-fg-subtle">Members</p>
          <ul className="divide-y divide-line">{members.map((m) => <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"><span className="text-fg">{m.name} <span className="text-fg-subtle">· {m.email}</span></span><span className="flex items-center gap-2"><Badge tone={m.role === "owner" ? "indigo" : "gray"}>{m.role}</Badge><span className="text-[12px] text-fg-subtle">since {fmtDate(m.created_at)}</span></span></li>)}</ul>
        </div>
      </Card>
      <Card id="security">
        <CardHeader title="Change password" />
        <ActionForm action={changePasswordAction} className="space-y-4 p-4" resetOnSuccess>
          <FormMessage />
          <Field name="currentPassword" label="Current password"><Input type="password" autoComplete="current-password" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="newPassword" label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" /></Field>
            <Field name="confirmPassword" label="Confirm new password"><Input type="password" autoComplete="new-password" /></Field>
          </div>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
