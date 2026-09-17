"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import { DuplicateQuoteButton } from "@/components/quotes/duplicate-quote-button";
import { DeleteQuoteButton } from "@/components/quotes/delete-quote-button";
import { DownloadQuotePdfButton } from "@/components/quotes/download-quote-pdf-button";
import { SendDraftQuoteButton } from "@/components/quotes/send-draft-quote-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type QuoteDocumentActionsCardProps = {
  quoteId: string;
  status: string;
  customerEmail?: string | null;
  conversationId?: string | null;
};

export function QuoteDocumentActionsCard({
  quoteId,
  status,
  customerEmail,
  conversationId,
}: QuoteDocumentActionsCardProps) {
  const isDraft = status === "draft";
  const hasCustomerEmail = Boolean(customerEmail?.trim());
  const canSendToClient = hasCustomerEmail || Boolean(conversationId?.trim());

  if (isDraft) {
    return (
      <div className="space-y-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Brouillon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canSendToClient
              ? hasCustomerEmail
                ? "Valide et envoie le devis au client par e-mail, ou modifie-le avant envoi."
                : "Envoie le devis dans la conversation client, ou modifie-le avant envoi."
              : "Aucun e-mail client — télécharge le PDF et transmets-le toi-même, ou modifie le devis pour ajouter un e-mail."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {canSendToClient ? (
            <SendDraftQuoteButton quoteId={quoteId} />
          ) : (
            <DownloadQuotePdfButton quoteId={quoteId} label="Télécharger le devis" fullWidth />
          )}

          <Link
            href={`/app/quotes/${quoteId}/edit`}
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full items-center justify-center gap-2")}
          >
            <Pencil className="size-4" />
            Modifier
          </Link>

          <DeleteQuoteButton quoteId={quoteId} />
        </div>

        {hasCustomerEmail ? (
          <p className="text-xs text-muted-foreground">
            Le client recevra un e-mail de ton entreprise avec le devis PDF (mentions légales incluses). Tu peux
            aussi{" "}
            <DownloadQuotePdfButton quoteId={quoteId} label="télécharger une copie" variant="link" /> avant envoi.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Document devis</p>
      <p className="text-xs text-muted-foreground">
        PDF professionnel (tableau détaillé, TVA, bon pour accord, mentions légales).
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <DownloadQuotePdfButton quoteId={quoteId} />
        <DuplicateQuoteButton quoteId={quoteId} />
      </div>
      <p className="text-xs text-muted-foreground">
        Devis déjà envoyé : pour en changer les lignes, duplique-le puis modifie la copie depuis sa fiche.
      </p>
    </div>
  );
}

/** Variante client connecté (espace /mes-devis). */
export function ClientQuotePdfDownloadButton({ quoteId }: { quoteId: string }) {
  return <DownloadQuotePdfButton quoteId={quoteId} label="Télécharger le devis (PDF)" fullWidth />;
}
