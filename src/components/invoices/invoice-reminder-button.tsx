"use client";

import * as React from "react";
import { toast } from "sonner";

import { sendManualInvoiceReminder } from "@/app/app/invoices/reminder-actions";
import { Button } from "@/components/ui/button";

export function InvoiceReminderButton({ invoiceId, label = "Relancer le client" }: { invoiceId: string; label?: string }) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const res = await sendManualInvoiceReminder(invoiceId);
    setPending(false);
    if (!res.ok) {
      toast.error(
        res.error === "no_email"
          ? "Aucun email client sur cette facture."
          : res.error === "too_soon"
            ? "Une relance est déjà partie il y a moins de 24 h. Réessayez demain."
            : "Impossible d'envoyer la relance.",
      );
      return;
    }
    toast.success("Relance envoyée.");
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void handleClick()}>
      {pending ? "Envoi…" : label}
    </Button>
  );
}
