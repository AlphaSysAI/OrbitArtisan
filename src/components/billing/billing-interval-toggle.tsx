"use client";

import type { BillingInterval } from "@/lib/billing/subscription-plans";
import { cn } from "@/lib/utils";

export function BillingIntervalToggle({
  value,
  onChange,
  className,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border bg-muted/40 p-1 text-sm font-medium",
        className,
      )}
      role="group"
      aria-label="Période de facturation"
    >
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cn(
          "rounded-full px-4 py-1.5 transition-colors",
          value === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Mensuel
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={cn(
          "rounded-full px-4 py-1.5 transition-colors",
          value === "annual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Annuel
        <span className="ml-1.5 text-xs font-semibold text-orange-600">−17 %</span>
      </button>
    </div>
  );
}
