import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./form";
export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-[22px] font-semibold tracking-tight text-fg">Welcome back</h1>
      <p className="mt-1 text-[13.5px] text-fg-subtle">Log in to your FormForge workspace.</p>
      <div className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-sm"><LoginForm next={next} /></div>
      <p className="mt-4 text-center text-[13px] text-fg-subtle">New here? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></p>
      <p className="mt-2 text-center text-[12px] text-fg-subtle">Demo: demo@formforge.dev / demo1234</p>
    </div>
  );
}
