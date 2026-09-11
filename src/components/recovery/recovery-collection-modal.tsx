"use client";

import * as React from "react";
import { toast } from "sonner";

import { submitToRubyPayeurAction } from "@/app/app/invoices/recovery-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { recoveryErrorMessage } from "@/lib/recovery/action-errors";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export type RecoveryCollectionModalProps = {
  invoiceId: string;
  invoiceNumber: string;
  amountDueCents: number;
  /** `true` si une mise en demeure a déjà été expédiée (renforce le dossier). */
  hasFormalNotice: boolean;
};

/**
 * Phase contentieuse : recueille le mandat explicite de recouvrement avant de
 * transmettre le dossier de créance à RubyPayeur.
 */
export function RecoveryCollectionModal({
  invoiceId,
  invoiceNumber,
  amountDueCents,
  hasFormalNotice,
}: RecoveryCollectionModalProps) {
  const [open, setOpen] = React.useState(false);
  const [mandateAccepted, setMandateAccepted] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setMandateAccepted(false);
  }

  function handleSubmit() {
    if (!mandateAccepted) return;
    startTransition(async () => {
      const result = await submitToRubyPayeurAction(invoiceId, true);
      if (!result.ok) {
        toast.error(recoveryErrorMessage(result.error));
        return;
      }
      toast.success("Dossier transmis au recouvrement. Tu seras notifié à chaque étape.");
      setOpen(false);
      setMandateAccepted(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        Confier au recouvrement
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Confier le recouvrement de la facture {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Le dossier est transmis à RubyPayeur, société de recouvrement partenaire, pour une
            action amiable puis judiciaire si nécessaire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Créance réclamée</span>
              <span className="font-medium">{formatEur(amountDueCents)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-muted-foreground">Coût si échec</span>
              <span className="font-medium">0 €</span>
            </div>
          </div>

          <p className="text-sm">
            <strong>Sans risque : « No cure, no pay ».</strong> RubyPayeur n&apos;est rémunéré
            qu&apos;en cas de succès, par une commission prélevée sur les sommes effectivement
            recouvrées. Si la créance reste impayée, tu ne paies rien.
          </p>

          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              · Pièces transmises : facture
              {hasFormalNotice ? ", mise en demeure et preuves de dépôt La Poste" : " et devis signé"}.
            </li>
            <li>· Relances amiables, mise en cause publique puis procédure judiciaire.</li>
            <li>· Suivi de l&apos;avancement directement depuis cette facture.</li>
          </ul>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={mandateAccepted}
              disabled={pending}
              onChange={(event) => setMandateAccepted(event.target.checked)}
            />
            <span>
              Je donne mandat à RubyPayeur pour recouvrer cette créance par voie amiable et, le cas
              échéant, judiciaire. J&apos;autorise la transmission de la facture, du devis signé et
              des courriers de mise en demeure, et je certifie que la créance est certaine, liquide
              et exigible.
            </span>
          </label>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Annuler</DialogClose>
          <Button
            type="button"
            disabled={!mandateAccepted || pending}
            onClick={handleSubmit}
          >
            {pending ? "Transmission…" : "Transmettre le dossier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
