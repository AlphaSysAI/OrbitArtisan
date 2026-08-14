"use client";

import * as React from "react";
import { ChevronLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TRADE_DOMAINS,
  categoriesForDomain,
  findTradeDomain,
  type TradeCategory,
} from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

export type TradeSelection = {
  categoryId: string;
  categoryLabel: string;
  tradeId: string;
  tradeLabel: string;
};

/**
 * Parcours Domaine → Catégorie → Métier, partagé entre la recherche client
 * et le tunnel d'estimation.
 */
export function TradePicker({
  subtitle,
  onSelect,
  onExit,
}: {
  subtitle?: string;
  onSelect: (selection: TradeSelection) => void;
  /** Retour depuis la toute première étape (sinon la flèche revient en arrière). */
  onExit?: () => void;
}) {
  const [domainId, setDomainId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<TradeCategory | null>(null);

  if (domainId && category) {
    return (
      <StepShell
        title={category.label}
        subtitle="Choisis le métier exact"
        onBack={() => setCategory(null)}
      >
        <ChoiceGrid>
          {category.trades.map((t) => (
            <ChoiceButton
              key={t.id}
              label={t.label}
              onClick={() =>
                onSelect({
                  categoryId: category.id,
                  categoryLabel: category.label,
                  tradeId: t.id,
                  tradeLabel: t.label,
                })
              }
            />
          ))}
        </ChoiceGrid>
      </StepShell>
    );
  }

  if (domainId) {
    return (
      <StepShell
        title={findTradeDomain(domainId)?.label ?? "Choisis une spécialité"}
        subtitle="Précise la spécialité"
        onBack={() => setDomainId(null)}
      >
        <ChoiceGrid>
          {categoriesForDomain(domainId).map((c) => (
            <ChoiceButton key={c.id} label={c.label} onClick={() => setCategory(c)} />
          ))}
        </ChoiceGrid>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="De quel type de professionnel as-tu besoin ?"
      subtitle={subtitle}
      onBack={onExit}
    >
      <ChoiceGrid>
        {TRADE_DOMAINS.map((d) => (
          <ChoiceButton key={d.id} emoji={d.emoji} label={d.label} onClick={() => setDomainId(d.id)} />
        ))}
      </ChoiceGrid>
    </StepShell>
  );
}

function ChoiceGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function StepShell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
            aria-label="Retour"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Search className="h-3.5 w-3.5 shrink-0" />
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ChoiceButton({
  emoji,
  label,
  onClick,
}: {
  emoji?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-4 py-4 text-left text-sm font-medium transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {emoji && <span className="text-xl">{emoji}</span>}
      <span>{label}</span>
    </button>
  );
}
