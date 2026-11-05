"use client";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/primitives";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <FormMessage />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="email" label="Email"><Input type="email" autoComplete="email" placeholder="you@company.com" /></Field>
      <Field name="password" label="Password"><Input type="password" autoComplete="current-password" placeholder="••••••••" /></Field>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">Log in</SubmitButton>
    </ActionForm>
  );
}
