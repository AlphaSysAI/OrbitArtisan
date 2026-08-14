import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function DashboardStatCard({
  icon: Icon,
  title,
  value,
  description,
  href,
  actionLabel,
  highlight,
  className,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  description: string;
  href: string;
  actionLabel: string;
  highlight?: "default" | "warning" | "success";
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={actionLabel}
      className={cn(
        "group app-surface relative flex min-h-[168px] flex-col justify-between overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0_0_0/0.08)] sm:p-6",
        highlight === "warning" && "border-warning/40 bg-warning/5",
        highlight === "success" && "border-success/35 bg-success/5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-brand/15 group-hover:text-brand",
            highlight === "warning" && "bg-warning/15 text-warning-foreground",
            highlight === "success" && "bg-success/15 text-success",
          )}
        >
          <Icon className="size-5" />
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
          {value}
        </p>
        <p className="text-sm leading-snug text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
