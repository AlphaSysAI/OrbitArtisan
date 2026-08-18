"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createDepositInvoice, createProgressInvoice } from "@/app/app/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function BtpInvoiceActions({
  quoteId,
  quoteGrandTotalCents,
  alreadyInvoicedCents,
}: {
  quoteId: string;
  quoteGrandTotalCents: number;
  alreadyInvoicedCents: number;
}) {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [progressOpen, setProgressOpen] = React.useState(false);
  const [depositPercent, setDepositPercent] = React.useState("30");
  const [progressPercent, setProgressPercent] = React.useState("60");
  const [pending, setPending] = React.useState(false);

  const remaining = Math.max(0, quoteGrandTotalCents - alreadyInvoicedCents);

  async function handleDeposit() {
    const percent = Number(depositPercent.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error("Pourcentage invalide.");
      return;
    }
    setPending(true);
    const res = await createDepositInvoice(quoteId, percent);
    setPending(false);
    if (!res.ok) {
      toast.error(
        res.error === "exceeds_remaining"
          ? "Montant supérieur au reste à facturer."
          : "Impossible de créer la facture d'acompte.",
      );
      return;
    }
    toast.success("Facture d'acompte créée.");
    setDepositOpen(false);
    router.push(`/app/invoices/${res.invoiceId}`);
    router.refresh();
  }

  async function handleProgress() {
    const percent = Number(progressPercent.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error("Pourcentage invalide.");
      return;
    }
    setPending(true);
    const res = await createProgressInvoice(quoteId, percent);
    setPending(false);
    if (!res.ok) {
      toast.error(
        res.error === "zero_amount"
          ? "Aucun montant à facturer pour cet avancement (déjà facturé ?)."
          : "Impossible de créer la facture de situation.",
      );
      return;
    }
    toast.success("Facture de situation créée.");
    setProgressOpen(false);
    router.push(`/app/invoices/${res.invoiceId}`);
    router.refresh();
  }

  if (remaining <= 0) {
    return (
      <p className="text-sm text-muted-foreground">Devis entièrement facturé ({formatEur(quoteGrandTotalCents)}).</p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Reste à facturer : <strong className="text-foreground">{formatEur(remaining)}</strong>
          {alreadyInvoicedCents > 0 ? ` (${formatEur(alreadyInvoicedCents)} déjà facturé)` : null}
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => setDepositOpen(true)}>
            Créer facture d&apos;acompte
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => setProgressOpen(true)}>
            Créer facture de situation
          </Button>
        </div>
      </div>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Facture d&apos;acompte</DialogTitle>
            <DialogDescription>
              Génère une facture pour un pourcentage du devis ({formatEur(quoteGrandTotalCents)} TTC facturé par
              vous).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deposit-pct">Pourcentage d&apos;acompte (%)</Label>
            <Input
              id="deposit-pct"
              inputMode="decimal"
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Montant estimé :{" "}
              {formatEur(Math.round((quoteGrandTotalCents * (Number(depositPercent) || 0)) / 100))}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDepositOpen(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={() => void handleDeposit()} disabled={pending}>
              {pending ? "Création…" : "Créer l'acompte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Facture de situation</DialogTitle>
            <DialogDescription>
              Avancement cumulé du chantier. Le montant facturé = {`{cumul %}`} du devis moins les factures déjà
              émises.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="progress-pct">Avancement cumulé (%)</Label>
            <Input
              id="progress-pct"
              inputMode="decimal"
              value={progressPercent}
              onChange={(e) => setProgressPercent(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProgressOpen(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={() => void handleProgress()} disabled={pending}>
              {pending ? "Création…" : "Créer la situation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
