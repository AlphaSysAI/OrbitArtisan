import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RoleSelectorCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  className?: string;
};

export function RoleSelectorCard({
  href,
  icon: Icon,
  title,
  description,
  cta,
  className,
}: RoleSelectorCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <Card className="h-full gap-5 p-6 transition-all duration-200 ring-foreground/10 group-hover:ring-foreground/25 group-hover:shadow-lg group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 ring-1 ring-foreground/10 transition-colors group-hover:bg-foreground/10">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        <p className="mt-auto flex items-center gap-1.5 text-sm font-medium">
          {cta}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </p>
      </Card>
    </Link>
  );
}
