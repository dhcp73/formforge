import Link from "next/link";
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4f46e5" /><path d="M10 9h12v3.2h-8.4v3h7.2v3.1h-7.2V23H10z" fill="#fff" /></svg>
  );
}
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg" aria-label="FormForge home">
      <LogoMark /> FormForge
    </Link>
  );
}
