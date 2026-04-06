import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function StepCard({
  step,
  title,
  description,
  done,
  href,
  actionLabel,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  href: string;
  actionLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow",
        done && "border-emerald-500/30 bg-emerald-500/[0.04]",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Link href={href} className={buttonVariants({ className: "mt-auto w-full justify-center" })}>
        {actionLabel}
      </Link>
    </div>
  );
}
