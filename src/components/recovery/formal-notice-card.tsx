"use client";

import * as React from "react";
import { toast } from "sonner";

import { sendFormalNoticeAction } from "@/app/app/invoices/recovery-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORMAL_NOTICE_OVERAGE_NOTICE } from "@/lib/billing/subscription-plans";
import { recoveryErrorMessage } from "@/lib/recovery/action-errors";
import {
  FORMAL_NOTICE_STATUS_LABELS,
  type FormalNoticeQuota,
  type FormalNoticeStatus,
  type FormalNoticeSummary,
} from "@/lib/recovery/types";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(value));
}

const BADGE_VARIANTS: Partial<
  Record<FormalNoticeStatus, "default" | "secondary" | "outline" | "destructive">
> = {
  delivered: "default",
  returned: "destructive",
  wrong_address: "destructive",
  failed: "destructive",
  canceled: "outline",
};

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(value));
}

export type FormalNoticeCardProps = {
  invoiceId: string;
  amountDueCents: number;
  daysOverdue: number;
  notice: FormalNoticeSummary | null;
  canSend: boolean;
  quota: FormalNoticeQuota;
};

/**
 * Phase pré-contentieuse : déclenche la mise en demeure par LRAR papier et
 * affiche l'état d'acheminement La Poste une fois la lettre déposée.
 */
export function FormalNoticeCard({
  invoiceId,
  amountDueCents,
  daysOverdue,
  notice,
  canSend,
  quota,
}: FormalNoticeCardProps) {
  const [pending, startTransition] = React.useTransition();
  const [costDialogOpen, setCostDialogOpen] = React.useState(false);

  function send(acceptExtraCost: boolean) {
    startTransition(async () => {
      const result = await sendFormalNoticeAction(invoiceId, { acceptExtraCost });
      if (!result.ok) {
        // Le quota a pu être consommé ailleurs entre l'affichage et le clic.
        if (result.error === "extra_cost_consent_required") {
          setCostDialogOpen(true);
          return;
        }
        toast.error(recoveryErrorMessage(result.error));
        return;
      }
      setCostDialogOpen(false);
      toast.success("Mise en demeure déposée à La Poste en recommandé avec AR.");
    });
  }

  function handleSend() {
    if (quota.nextIsBillable) {
      setCostDialogOpen(true);
      return;
    }
    send(false);
  }

  const hasNotice = notice !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mise en demeure</CardTitle>
        <CardDescription>
          {hasNotice
            ? "Courrier recommandé avec accusé de réception, imprimé et distribué par La Poste."
            : `Facture impayée depuis ${daysOverdue} jour${daysOverdue > 1 ? "s" : ""}. Une mise en demeure interrompt la prescription et fait courir les pénalités de retard.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {hasNotice ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={BADGE_VARIANTS[notice.status] ?? "secondary"}>
                {FORMAL_NOTICE_STATUS_LABELS[notice.status]}
              </Badge>
              {notice.hasDeliveryProof && (
                <Badge variant="outline">Accusé de réception archivé</Badge>
              )}
            </div>

            <dl className="grid gap-1 text-sm">
              {notice.trackingNumber && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">N° de suivi La Poste</dt>
                  <dd className="font-mono">{notice.trackingNumber}</dd>
                </div>
              )}
              {notice.sentAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Déposée le</dt>
                  <dd>{formatDate(notice.sentAt)}</dd>
                </div>
              )}
              {notice.deliveredAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Distribuée le</dt>
                  <dd>{formatDate(notice.deliveredAt)}</dd>
                </div>
              )}
            </dl>

            {notice.failureReason && (
              <p className="text-sm text-destructive">{notice.failureReason}</p>
            )}

            {!notice.trackingNumber && notice.status === "pending" && (
              <p className="text-sm text-muted-foreground">
                Le numéro de suivi sera disponible dès la prise en charge par La Poste.
              </p>
            )}
          </>
        ) : (
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Montant réclamé</dt>
              <dd className="font-medium">{formatEur(amountDueCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Retard</dt>
              <dd>
                {daysOverdue} jour{daysOverdue > 1 ? "s" : ""}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>

      {canSend && (
        <CardFooter className="flex-col items-start gap-2">
          <Button type="button" disabled={pending} onClick={handleSend}>
            {pending ? "Envoi en cours…" : "Envoyer une mise en demeure par LRAR (La Poste)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {quota.nextIsBillable
              ? `Quota de ${formatMonth(quota.periodStart)} déjà utilisé — cet envoi vous sera refacturé.`
              : `${quota.remaining} recommandé${quota.remaining > 1 ? "s" : ""} inclus restant${quota.remaining > 1 ? "s" : ""} sur ${formatMonth(quota.periodStart)}.`}
          </p>
        </CardFooter>
      )}

      <Dialog
        open={costDialogOpen}
        onOpenChange={(next) => {
          if (!pending) setCostDialogOpen(next);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Cet envoi vous sera facturé</DialogTitle>
            <DialogDescription>
              Votre recommandé inclus pour {formatMonth(quota.periodStart)} a déjà été utilisé.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              {FORMAL_NOTICE_OVERAGE_NOTICE} Le montant apparaîtra sur votre prochaine facture
              d&apos;abonnement.
            </p>
            <p className="text-muted-foreground">
              Votre prochain recommandé inclus sera disponible le{" "}
              {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
                new Date(quota.periodEnd),
              )}
              . Les recommandés non utilisés ne se reportent pas d&apos;un mois sur l&apos;autre.
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={pending} />}>Annuler</DialogClose>
            <Button type="button" disabled={pending} onClick={() => send(true)}>
              {pending ? "Envoi en cours…" : "Accepter et envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
