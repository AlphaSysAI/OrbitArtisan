"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepShell } from "@/components/trades/trade-picker";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { cn } from "@/lib/utils";

import { confirmLeadLots, proposeLots, type ProposedLot } from "./actions";

/**
 * Corps d'état nécessaires : l'IA propose, le client décoche ce qui ne le concerne
 * pas. Un seul métier détecté : validation automatique, aucun écran en plus.
 */
export function LotsStep({
  token,
  description,
  messages,
  mediaCount,
  onBack,
  onDone,
}: {
  token: string;
  description: string;
  messages: LeadChatMessage[];
  mediaCount: number;
  onBack: () => void;
  onDone: (lots: ProposedLot[]) => void;
}) {
  const [lots, setLots] = React.useState<ProposedLot[] | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = React.useCallback(
    async (chosen: ProposedLot[]) => {
      setSaving(true);
      setError(null);
      const res = await confirmLeadLots({ token, lots: chosen, description, messages, mediaCount });
      setSaving(false);
      // Sélection déjà figée (retour arrière après la mise en relation) : on continue.
      if (!res.ok && res.error !== "already_matched") {
        setError("L’enregistrement a échoué. Réessaie.");
        return;
      }
      onDone(chosen);
    },
    [token, description, messages, mediaCount, onDone],
  );

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const res = await proposeLots({ token, description, messages });
      // Analyse indisponible : on garde le métier choisi au départ (parcours historique).
      if (!res.ok) {
        onDone([]);
        return;
      }
      if (res.lots.length <= 1) {
        await confirm(res.lots);
        return;
      }
      setLots(res.lots);
      setSelected(new Set(res.lots.map((_, i) => i)));
    })();
  }, [token, description, messages, confirm, onDone]);

  if (!lots) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">On identifie les métiers nécessaires à ton projet…</p>
      </div>
    );
  }

  const chosen = lots.filter((_, i) => selected.has(i));

  return (
    <StepShell
      title="Les métiers nécessaires"
      subtitle="Décoche ce qui ne te concerne pas. Chaque artisan ne reçoit que la partie de son métier."
      onBack={onBack}
    >
      <ul className="space-y-2">
        {lots.map((lot, i) => {
          const on = selected.has(i);
          return (
            <li key={`${lot.trade_category}-${lot.trade ?? ""}`}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                  on ? "border-primary ring-1 ring-primary" : "opacity-70",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{lot.label}</span>
                  {lot.summary ? <span className="mt-1 block text-sm text-muted-foreground">{lot.summary}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        disabled={!chosen.length || saving}
        onClick={() => void confirm(chosen)}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continuer avec {chosen.length} métier{chosen.length > 1 ? "s" : ""}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Jusqu’à 3 artisans par métier, près de chez toi.</p>
    </StepShell>
  );
}
