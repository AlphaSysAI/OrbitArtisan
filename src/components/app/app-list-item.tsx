import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function AppListItem({
  href,
  title,
  subtitle,
  meta,
  trailing,
  className,
  emphasis,
  unread,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  emphasis?: "default" | "success" | "danger" | "warning";
  /** Conversation ou élément non lu — pastille + accent visuel. */
  unread?: boolean;
}) {
  const content = (
    <>
      {unread ? (
        <span
          className="mt-0.5 size-2.5 shrink-0 rounded-full bg-destructive shadow-sm ring-2 ring-destructive/20"
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "truncate text-base tracking-tight",
              unread ? "font-bold text-foreground" : "font-semibold",
            )}
          >
            {title}
          </p>
          {unread ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              Non lu
            </span>
          ) : null}
          {meta}
        </div>
        {subtitle ? (
          <div className={cn("text-sm", unread ? "text-foreground/80" : "text-muted-foreground")}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ?? (href ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : null)}
    </>
  );

  const shellClass = cn(
    "app-surface flex min-h-[76px] items-center gap-4 px-5 py-4 transition-all duration-200",
    href && "hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_24px_rgb(0_0_0/0.06)]",
    unread && "border-destructive/25 bg-destructive/[0.03]",
    !unread && emphasis === "success" && "border-success/40 bg-success/[0.04]",
    !unread && emphasis === "danger" && "border-destructive/40 bg-destructive/[0.04]",
    !unread && emphasis === "warning" && "border-warning/45 bg-warning/5",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shellClass}>
        {content}
      </Link>
    );
  }

  return <div className={shellClass}>{content}</div>;
}
