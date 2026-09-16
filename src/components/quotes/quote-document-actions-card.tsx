"use client";

import { FileDown } from "lucide-react";

import { DuplicateQuoteButton } from "@/components/quotes/duplicate-quote-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function QuoteDocumentActionsCard({ quoteId }: { quoteId: string }) {
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Document devis</p>
      <p className="text-xs text-muted-foreground">
        PDF professionnel (tableau détaillé, TVA, bon pour accord). Complète tes mentions légales dans Réglages
        avant envoi au client.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={`/api/quotes/${quoteId}/pdf`}
          download
          className={cn(buttonVariants({ variant: "default" }), "inline-flex items-center justify-center gap-2")}
        >
          <FileDown className="size-4" />
          Télécharger le PDF
        </a>
        <DuplicateQuoteButton quoteId={quoteId} />
      </div>
      <p className="text-xs text-muted-foreground">
        Pour ajuster les lignes, utilise « Dupliquer » puis modifie la copie depuis la fiche devis.
      </p>
    </div>
  );
}

/** Variante client connecté (espace /mes-devis). */
export function ClientQuotePdfDownloadButton({ quoteId }: { quoteId: string }) {
  return (
    <a
      href={`/api/quotes/${quoteId}/pdf`}
      download
      className={cn(buttonVariants({ variant: "default", className: "w-full gap-2" }))}
    >
      <FileDown className="size-4" />
      Télécharger le devis (PDF)
    </a>
  );
}
