import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardStatCard({
  icon: Icon,
  title,
  value,
  description,
  href,
  actionLabel,
  highlight,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  description: string;
  href: string;
  actionLabel: string;
  highlight?: "default" | "warning" | "success";
}) {
  return (
    <Card
      className={cn(
        highlight === "warning" && "border-amber-500/40 bg-amber-500/[0.03]",
        highlight === "success" && "border-emerald-500/40 bg-emerald-500/[0.03]",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription className="sr-only">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Link href={href} className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}>
          {actionLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
