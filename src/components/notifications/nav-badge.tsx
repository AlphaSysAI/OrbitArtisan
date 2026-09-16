"use client";

import { cn } from "@/lib/utils";

const badgeBase =
  "flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm";

export function NavBadge({
  count,
  className,
  variant = "corner",
}: {
  count: number;
  className?: string;
  /** inline = à côté du libellé (header) ; corner = coin d'une icône */
  variant?: "corner" | "inline";
}) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  if (variant === "inline") {
    return (
      <span className={cn(badgeBase, "shrink-0", className)} aria-hidden>
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        badgeBase,
        "pointer-events-none absolute right-0 top-0 z-10 ring-2 ring-background",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
