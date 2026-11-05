import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[13px] text-accent">404</p>
      <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-fg">Page not found</h1>
      <p className="mt-1 text-[13.5px] text-fg-subtle">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
      <div className="mt-6 flex gap-2"><ButtonLink href="/" variant="primary">Home</ButtonLink><ButtonLink href="/docs">Docs</ButtonLink><ButtonLink href="/dashboard">Dashboard</ButtonLink></div>
    </main>
  );
}
