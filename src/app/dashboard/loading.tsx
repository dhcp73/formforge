import { Skeleton } from "@/components/ui/primitives";
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-48" /><Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      <div className="mt-4 space-y-2 rounded-lg border border-line bg-panel p-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
    </div>
  );
}
