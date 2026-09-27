"use client";

import * as React from "react";
import { Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";

import { resendQuoteEmail } from "@/app/app/quotes/actions";
import { Button } from "@/components/ui/button";

export function ResendQuoteEmailButton({ quoteId, customerEmail }: { quoteId: string; customerEmail: string }) {
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function handleResend() {
    setPending(true);
    const res = await resendQuoteEmail(quoteId);
    setPending(false);
    setConfirming(false);

    if (res.ok) {
      toast.success(`Devis renvoyé à ${customerEmail} avec le PDF à jour.`);
      return;
    }
    if (res.error === "quote_pdf_profile_incomplete") {
      toast.error(`Complète ton profil avant envoi : ${res.validation.blocking.join(" ")}`);
      return;
    }
    toast.error(
      res.error === "no_email"
        ? "Aucun e-mail client sur ce devis."
        : res.error === "not_sent"
          ? "Seul un devis envoyé (en attente de réponse) peut être renvoyé."
          : "L'e-mail n'a pas pu partir. Réessaie ou télécharge le PDF.",
    );
  }

  // Double validation sur mobile : évite un renvoi involontaire au client.
  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => setConfirming(true)}>
        <MailPlus className="size-4" />
        Renvoyer le devis par e-mail
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Renvoyer à <strong className="text-foreground">{customerEmail}</strong> ?
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="gap-2" disabled={pending} onClick={() => void handleResend()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
          {pending ? "Envoi…" : "Confirmer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
