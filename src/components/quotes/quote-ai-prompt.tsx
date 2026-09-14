"use client";

import { useState } from "react";
import { Mic, Sparkles, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openArtisanAssistant } from "@/lib/ai/assistant-bridge";
import { QUOTE_NEW_EXAMPLE } from "@/lib/ai/assistant-quote-context";
import { cn } from "@/lib/utils";

export function QuoteAiPrompt({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 border-brand/45",
        "bg-gradient-to-br from-brand/14 via-brand/6 to-transparent",
        "shadow-[0_12px_40px_oklch(0.55_0.13_55/0.14)]",
        className,
      )}
      aria-labelledby="quote-ai-prompt-title"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-brand/10 blur-2xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
              <Sparkles className="size-4" strokeWidth={2.25} />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
              Le plus rapide
            </p>
          </div>

          <h2 id="quote-ai-prompt-title" className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Décrivez-moi le chantier — je prépare le devis
          </h2>

          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Parlez ou écrivez comme à un collègue : client, ouvrages, matériaux, quantités, temps de
            pose… Soline remplit le formulaire pour vous.
          </p>

          <p className="text-sm italic text-foreground/80">{QUOTE_NEW_EXAMPLE}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[13rem]">
          <Button
            type="button"
            className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => openArtisanAssistant()}
          >
            <Sparkles className="size-4" />
            Décrire à Soline
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full border-brand/30 bg-background/80 hover:bg-brand/5"
            onClick={() => openArtisanAssistant({ handsFree: true })}
          >
            <Mic className="size-4" />
            Dicter (mains libres)
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
          >
            <PenLine className="size-3.5" />
            Remplir le formulaire à la main
          </button>
        </div>
      </div>
    </section>
  );
}
