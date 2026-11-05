"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authenticate, createSession, createUser, AuthError, deleteSession } from "@/lib/auth";
import { setSessionCookie, SESSION_COOKIE } from "@/lib/session";
import type { ActionState } from "@/components/ui/action-form";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address";
  if (!password) fieldErrors.password = "Password is required";
  if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };
  try {
    const { userId } = authenticate(email, password);
    await setSessionCookie(createSession(userId));
  } catch (e) {
    return { error: e instanceof AuthError ? e.message : "Could not sign in." };
  }
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const workspace = String(fd.get("workspace") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Name is required";
  if (!email) fieldErrors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters";
  if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };
  try {
    const { userId } = createUser({ name, email, password, workspaceName: workspace });
    await setSessionCookie(createSession(userId));
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : "Could not create account.";
    return { error: msg, fieldErrors: /email/i.test(msg) ? { email: msg } : undefined };
  }
  redirect("/dashboard?welcome=1");
}

export async function logoutAction() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) deleteSession(t);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
