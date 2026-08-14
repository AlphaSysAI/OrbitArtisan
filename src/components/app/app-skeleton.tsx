import { cn } from "@/lib/utils";

export function AppSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

export function AppPageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <AppSkeleton className="h-3 w-24" />
        <AppSkeleton className="h-10 w-64 max-w-full" />
        <AppSkeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <AppSkeleton key={i} className="h-40" />
        ))}
      </div>
      <div className="space-y-3">
        <AppSkeleton className="h-[76px]" />
        <AppSkeleton className="h-[76px]" />
        <AppSkeleton className="h-[76px]" />
      </div>
    </div>
  );
}
