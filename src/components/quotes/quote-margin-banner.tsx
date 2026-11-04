import { formatCents } from "@/lib/format/money";

export function QuoteMarginBanner({ grandTotalCents }: { grandTotalCents: number }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span className="text-sm tabular-nums">Total HT : <strong>{formatCents(grandTotalCents)}</strong></span>
        <span className="text-xs text-muted-foreground">La marge dépend de vos coûts réels de fournitures et de main-d’œuvre.</span>
      </div>
    </div>
  );
}
