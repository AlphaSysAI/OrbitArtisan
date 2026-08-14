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
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  emphasis?: "default" | "success" | "danger" | "warning";
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold tracking-tight">{title}</p>
          {meta}
        </div>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {trailing ?? (href ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : null)}
    </>
  );

  const shellClass = cn(
    "app-surface flex min-h-[76px] items-center gap-4 px-5 py-4 transition-all duration-200",
    href && "hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_24px_rgb(0_0_0/0.06)]",
    emphasis === "success" && "border-success/40 bg-success/[0.04]",
    emphasis === "danger" && "border-destructive/40 bg-destructive/[0.04]",
    emphasis === "warning" && "border-warning/45 bg-warning/5",
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
