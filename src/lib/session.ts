import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionByToken, type SessionInfo } from "./auth";

export const SESSION_COOKIE = "ff_session";

export async function getSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  return getSessionByToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (process.env.PUBLIC_URL ?? "").startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
