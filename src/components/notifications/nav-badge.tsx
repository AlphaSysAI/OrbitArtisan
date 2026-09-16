"use client";

import { cn } from "@/lib/utils";

export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "pointer-events-none absolute right-0 top-0 z-10 flex min-h-[1.125rem] min-w-[1.125rem] -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm ring-2 ring-background",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
