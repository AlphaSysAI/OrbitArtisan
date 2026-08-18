"use client";

import { computeQuoteMarginPreview, formatMarginEur } from "@/lib/billing/quote-margin";
import { cn } from "@/lib/utils";

export function QuoteMarginBanner({
  grandTotalCents,
  laborTotalCents,
  materialsTotalCents,
}: {
  grandTotalCents: number;
  laborTotalCents: number;
  materialsTotalCents: number;
}) {
  const margin = computeQuoteMarginPreview({
    grandTotalCents,
    laborTotalCents,
    materialsTotalCents,
  });

  const positive = margin.grossMarginCents >= 0;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6",
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Marge brute estimée (déboursé matière + MO à 65 % du PV) — indicatif
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
          <span>
            HT : <strong>{formatMarginEur(margin.grandTotalCents)}</strong>
          </span>
          <span className="text-muted-foreground">
            Matière : {formatMarginEur(margin.estimatedMaterialCostCents)}
          </span>
          <span className="text-muted-foreground">MO : {formatMarginEur(margin.estimatedLaborCostCents)}</span>
          <span className={cn("font-semibold", positive ? "text-green-700 dark:text-green-400" : "text-destructive")}>
            Marge : {formatMarginEur(margin.grossMarginCents)} ({margin.grossMarginPercent} %)
          </span>
        </div>
      </div>
    </div>
  );
}
