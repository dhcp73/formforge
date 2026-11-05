import nodemailer, { type Transporter } from "nodemailer";
import { getDb, now } from "./db";
import { newId } from "./ids";

let transporter: Transporter | null | undefined;
function smtp() {
  if (transporter !== undefined) return transporter;
  transporter = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transporter;
}

export const MAIL_FROM = process.env.MAIL_FROM || "FormForge <notifications@formforge.local>";

/**
 * Every email is recorded in the Outbox (dashboard → Outbox). When SMTP_URL is set
 * (e.g. smtp://localhost:1025 for Mailpit) it is also delivered via SMTP.
 */
export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; workspaceId?: string | null; kind?: string }) {
  const id = newId("em");
  let status = "logged";
  let transport = "outbox";
  let error: string | null = null;
  const t = smtp();
  if (t) {
    transport = "smtp";
    try { await t.sendMail({ from: MAIL_FROM, to: input.to, subject: input.subject, text: input.text, html: input.html }); status = "sent"; }
    catch (e) { status = "failed"; error = e instanceof Error ? e.message : String(e); }
  }
  getDb()
    .prepare("INSERT INTO emails (id, workspace_id, to_addr, subject, text_body, html_body, kind, status, transport, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.workspaceId ?? null, input.to, input.subject, input.text, input.html ?? null, input.kind ?? "notification", status, transport, error, now());
  return { id, status, error };
}

export function listEmails(workspaceId: string, limit = 100) {
  return getDb().prepare("SELECT * FROM emails WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?").all(workspaceId, limit) as {
    id: string; to_addr: string; subject: string; text_body: string; kind: string; status: string; transport: string; error: string | null; created_at: string;
  }[];
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
