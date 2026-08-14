import Link from "next/link";
import { Check, type LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function StepCard({
  step,
  title,
  description,
  done,
  href,
  actionLabel,
  icon: Icon,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  href: string;
  actionLabel: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "app-surface flex flex-col p-6 transition-all duration-200",
        done && "border-success/30 bg-success/[0.04]",
      )}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
            done ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {done ? <Check className="size-5" strokeWidth={2.5} /> : step}
        </span>
        {Icon ? (
          <Icon className={cn("size-5", done ? "text-success" : "text-muted-foreground")} />
        ) : null}
      </div>

      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>

      <Link
        href={href}
        className={buttonVariants({
          variant: done ? "outline" : "default",
          size: "lg",
          className: "mt-6 w-full justify-center",
        })}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
