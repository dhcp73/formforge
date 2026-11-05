import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";
const base = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent select-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  secondary: "bg-panel text-fg border border-line hover:bg-subtle shadow-[0_1px_0_rgb(0_0_0/0.03)]",
  outline: "border border-line-strong text-fg hover:bg-subtle",
  ghost: "text-fg-muted hover:bg-muted hover:text-fg",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
};
const sizes: Record<Size, string> = { sm: "h-7 px-2.5 text-[12.5px]", md: "h-8 px-3 text-[13px]", lg: "h-10 px-4 text-sm", icon: "h-8 w-8" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
});

export function ButtonLink({ href, variant = "secondary", size = "md", className, children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const external = /^https?:/.test(href) || href.startsWith("/api/");
  if (external) return <a href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>{children}</a>;
  return <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>{children}</Link>;
}
