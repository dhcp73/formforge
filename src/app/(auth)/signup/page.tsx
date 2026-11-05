import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "./form";
export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-[22px] font-semibold tracking-tight text-fg">Create your workspace</h1>
      <p className="mt-1 text-[13.5px] text-fg-subtle">Unlimited forms. Free forever for small projects.</p>
      <div className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-sm"><SignupForm /></div>
      <p className="mt-4 text-center text-[13px] text-fg-subtle">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Log in</Link></p>
    </div>
  );
}
