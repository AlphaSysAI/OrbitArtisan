"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { TRADE_CATEGORIES, findTradeCategory } from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
  "dark:bg-input/30 dark:disabled:bg-input/80",
);

export function TradeSelect({
  initialCategoryId,
  initialTradeId,
  required = false,
}: {
  initialCategoryId: string | null;
  initialTradeId: string | null;
  required?: boolean;
}) {
  // Une valeur devenue invalide (métier retiré de la nomenclature) est ignorée
  // plutôt qu'affichée : le select ne peut pas représenter une option absente.
  const validInitialCategory = findTradeCategory(initialCategoryId)?.id ?? "";
  const [categoryId, setCategoryId] = React.useState(validInitialCategory);
  const [tradeId, setTradeId] = React.useState(() => {
    const category = findTradeCategory(validInitialCategory);
    if (!category || !initialTradeId) return "";
    return category.trades.some((t) => t.id === initialTradeId) ? initialTradeId : "";
  });

  const category = findTradeCategory(categoryId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="trade_category" className="text-base">
          Secteur d’activité {required && <span className="text-destructive">*</span>}
        </Label>
        <select
          id="trade_category"
          name="trade_category"
          className={selectClassName}
          value={categoryId}
          required={required}
          onChange={(e) => {
            setCategoryId(e.target.value);
            // Le métier retenu n'appartient plus au nouveau secteur : on repart de zéro.
            setTradeId("");
          }}
        >
          <option value="">Sélectionne un secteur…</option>
          {TRADE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="trade" className="text-base">
          Métier {required && <span className="text-destructive">*</span>}
        </Label>
        <select
          id="trade"
          name="trade"
          className={selectClassName}
          value={tradeId}
          required={required && Boolean(categoryId)}
          disabled={!category}
          onChange={(e) => setTradeId(e.target.value)}
        >
          <option value="">
            {category ? "Sélectionne un métier…" : "Choisis d’abord un secteur"}
          </option>
          {(category?.trades ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
