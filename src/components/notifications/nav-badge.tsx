"use client";

import { cn } from "@/lib/utils";

export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "pointer-events-none absolute -right-1 -top-1 flex min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
