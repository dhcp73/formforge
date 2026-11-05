"use client";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/primitives";
import { signupAction } from "../actions";

export function SignupForm() {
  return (
    <ActionForm action={signupAction} className="space-y-4">
      <FormMessage />
      <Field name="name" label="Full name"><Input autoComplete="name" placeholder="Rahul Patel" /></Field>
      <Field name="email" label="Work email"><Input type="email" autoComplete="email" placeholder="you@company.com" /></Field>
      <Field name="password" label="Password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" /></Field>
      <Field name="workspace" label="Workspace name (optional)"><Input placeholder="Acme Inc" /></Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creating…">Create account</SubmitButton>
    </ActionForm>
  );
}
