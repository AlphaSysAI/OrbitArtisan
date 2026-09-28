"use client";

import { EstimationWizard } from "@/app/estimation/estimation-wizard";
import type { TradeSelection } from "@/components/trades/trade-picker";

export function VitrineEstimationSection({
  slug,
  businessName,
  presetTrade,
}: {
  slug: string;
  businessName: string;
  presetTrade: TradeSelection | null;
}) {
  return (
    <EstimationWizard
      originArtisanSlug={slug}
      presetTrade={presetTrade}
      owner={{ slug, businessName }}
      compact
    />
  );
}
