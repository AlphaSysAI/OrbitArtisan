"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { sendDraftQuote } from "@/app/app/quotes/actions";
import { Button } from "@/components/ui/button";

export function SendDraftQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleSend() {
    setPending(true);
    const res = await sendDraftQuote(quoteId);
    setPending(false);

    if (!res.ok) {
      if (res.error === "quote_pdf_profile_incomplete") {
        toast.error(`Complète ton profil avant envoi : ${res.validation.blocking.join(" ")}`, {
          action: {
            label: "Réglages",
            onClick: () => {
              window.location.href = "/app/reglages?tab=activite";
            },
          },
        });
        return;
      }
      if (res.error === "no_email") {
        toast.error("Ajoute l'e-mail du client (Modifier) ou télécharge le PDF pour le transmettre toi-même.");
        return;
      }
      if (res.error === "not_draft") {
        toast.error("Ce devis n'est plus un brouillon — recharge la page.");
        router.refresh();
        return;
      }
      toast.error("Impossible d'envoyer le devis. Réessaie.");
      return;
    }

    if (res.notifyFailed) {
      toast.message("Devis marqué comme envoyé", {
        description:
          "L'e-mail n'a pas pu partir. Télécharge le PDF depuis la fiche et transmets-le manuellement au client.",
      });
    } else {
      toast.success(
        res.emailSent
          ? "Devis envoyé au client par e-mail avec le PDF en pièce jointe."
          : "Devis envoyé au client (PDF dans la conversation).",
      );
    }
    router.refresh();
  }

  return (
    <Button type="button" className="w-full gap-2" disabled={pending} onClick={() => void handleSend()}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
      {pending ? "Envoi en cours…" : "Envoyer le devis au client"}
    </Button>
  );
}
