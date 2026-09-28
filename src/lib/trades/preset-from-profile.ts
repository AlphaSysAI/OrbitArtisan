import type { TradeSelection } from "@/components/trades/trade-picker";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";

export function presetTradeFromProfile(
  tradeCategory: string | null,
  trade: string | null,
): TradeSelection | null {
  const category = findTradeCategory(tradeCategory);
  const tradeItem = findTrade(tradeCategory, trade);
  if (!category || !tradeItem) return null;
  return {
    categoryId: category.id,
    categoryLabel: category.label,
    tradeId: tradeItem.id,
    tradeLabel: tradeItem.label,
  };
}
