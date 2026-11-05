"use client";
import * as React from "react";
import { ThemeProvider as NT, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NT attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</NT>;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} data-testid="theme-toggle"
      className={"inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg " + (className ?? "")}>
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
