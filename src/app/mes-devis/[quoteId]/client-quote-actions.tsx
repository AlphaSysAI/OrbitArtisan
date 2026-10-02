"use client";

import * as React from "react";
import { toast } from "sonner";

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

import { clientAcceptQuote, clientRejectQuote } from "../actions";
import { VAT_CERTIFICATION_CHECKBOX } from "@/lib/billing/vat-certification";

export function ClientQuoteActions({
  quoteId,
  status,
  expired = false,
  vatCertificationLines = [],
}: {
  quoteId: string;
  status: string;
  /** Taux réduit : texte que le client certifie en acceptant (vide = taux normal). */
  vatCertificationLines?: string[];
  /** Devis "sent" dont la date de validité (valid_until) est dépassée. */
  expired?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [signerName, setSignerName] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const [vatCertified, setVatCertified] = React.useState(false);
  const needsCertification = vatCertificationLines.length > 0;
  const [loading, setLoading] = React.useState<"accept" | "reject" | null>(null);

  if (status !== "sent") {
    return null;
  }

  async function onReject() {
    if (!confirm("Refuser ce devis ? L’artisan pourra le voir dans son espace.")) return;
    setLoading("reject");
    const res = await clientRejectQuote(quoteId);
    setLoading(null);
    if (!res.ok) {
      toast.error("Impossible d’enregistrer le refus.");
      return;
    }
    toast.success("Devis refusé.");
  }

  async function onAcceptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ack) {
      toast.error("Coche la case pour confirmer la validation du devis.");
      return;
    }
    if (needsCertification && !vatCertified) {
      toast.error("Coche la certification TVA pour bénéficier du taux réduit.");
      return;
    }
    if (signerName.trim().length < 2) {
      toast.error("Saisis ton nom complet pour signer.");
      return;
    }
    setLoading("accept");
    const res = await clientAcceptQuote(quoteId, signerName, vatCertified);
    setLoading(null);
    if (!res.ok) {
      toast.error(
        res.error === "invalid_name"
          ? "Nom de signature invalide."
          : res.error === "certification_required"
            ? "La certification TVA est requise pour ce devis à taux réduit."
            : "Impossible de valider le devis.",
      );
      return;
    }
    toast.success("Devis accepté et signé.");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Button type="button" variant="outline" className="border-red-500/60 text-red-700 hover:bg-red-500/10" onClick={onReject} disabled={loading !== null}>
        {loading === "reject" ? "…" : "Refuser le devis"}
      </Button>
      {expired ? (
        <p className="text-sm text-muted-foreground">
          Devis expiré — demande une mise à jour à l&apos;artisan avant de pouvoir le valider.
        </p>
      ) : (
        <Button type="button" onClick={() => setOpen(true)} disabled={loading !== null}>
          Valider le devis
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onAcceptSubmit}>
            <DialogHeader>
              <DialogTitle>Signature du devis</DialogTitle>
              <DialogDescription>
                En validant, tu acceptes le montant et le détail de ce devis. Saisis ton nom complet comme signature
                électronique.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="signer_name">Nom complet (signature)</Label>
                <Input
                  id="signer_name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Prénom Nom"
                  autoComplete="name"
                  required
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-1 size-4 rounded border"
                />
                <span>Je confirme avoir lu le devis et j’accepte les montants indiqués.</span>
              </label>
              {needsCertification ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {vatCertificationLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  <label className="flex cursor-pointer items-start gap-3 pt-1 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={vatCertified}
                      onChange={(e) => setVatCertified(e.target.checked)}
                      className="mt-1 size-4 rounded border"
                    />
                    <span>{VAT_CERTIFICATION_CHECKBOX}</span>
                  </label>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading !== null}>
                {loading === "accept" ? "Validation…" : "Valider et signer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
