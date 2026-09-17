"use client";

import Link from "next/link";
import { FileDown, Pencil } from "lucide-react";

import { DuplicateQuoteButton } from "@/components/quotes/duplicate-quote-button";
import { DeleteQuoteButton } from "@/components/quotes/delete-quote-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function QuoteDocumentActionsCard({ quoteId, status }: { quoteId: string; status: string }) {
  const isDraft = status === "draft";

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Document devis</p>
      <p className="text-xs text-muted-foreground">
        PDF professionnel (tableau détaillé, TVA, bon pour accord). Complète tes mentions légales dans Réglages
        avant envoi au client.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={`/api/quotes/${quoteId}/pdf`}
          download
          className={cn(buttonVariants({ variant: "default" }), "inline-flex items-center justify-center gap-2")}
        >
          <FileDown className="size-4" />
          Télécharger le PDF
        </a>
        {isDraft ? (
          <Link
            href={`/app/quotes/${quoteId}/edit`}
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center justify-center gap-2")}
          >
            <Pencil className="size-4" />
            Modifier
          </Link>
        ) : null}
        <DuplicateQuoteButton quoteId={quoteId} />
        {isDraft ? <DeleteQuoteButton quoteId={quoteId} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {isDraft
          ? "Brouillon modifiable et supprimable tant qu'il n'a pas été envoyé au client."
          : "Devis déjà envoyé : pour en changer les lignes, utilise « Dupliquer » puis modifie la copie depuis sa fiche."}
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
