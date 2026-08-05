"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteArtisanCustomerLink, type CustomerDeletionCounts } from "@/lib/contacts/actions";
import { cn } from "@/lib/utils";

const ERROR_MESSAGES: Record<string, string> = {
  has_quotes: "Ce client a des devis enregistrés : la suppression est impossible.",
  has_invoices: "Ce client a des factures enregistrées : la suppression est impossible.",
  forbidden: "Ce client n’est pas rattaché à ton activité.",
  rls_blocked:
    "Suppression bloquée par la base : la migration contacts_delete_policies.sql n’a pas encore été exécutée.",
};

export function DeleteCustomerButton({
  customerUserId,
  customerLabel,
  blockedReason,
  counts,
}: {
  customerUserId: string;
  customerLabel: string;
  /** Renseigné si un devis ou une facture interdit la suppression. */
  blockedReason: "quotes" | "invoices" | null;
  counts: CustomerDeletionCounts;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  if (blockedReason) {
    return (
      <p className="text-xs text-muted-foreground">
        {blockedReason === "quotes"
          ? "Suppression indisponible : ce client a des devis."
          : "Suppression indisponible : ce client a des factures."}
      </p>
    );
  }

  async function onConfirm() {
    setLoading(true);
    const res = await deleteArtisanCustomerLink(customerUserId);
    setLoading(false);

    if (!res.ok) {
      toast.error(ERROR_MESSAGES[res.error] ?? "Suppression impossible. Réessaie.");
      setOpen(false);
      return;
    }

    toast.success("Client supprimé de tes contacts");
    setOpen(false);
    router.push("/app/contacts");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5 text-destructive hover:text-destructive",
        )}
      >
        <Trash2 className="h-4 w-4" />
        Supprimer ce client
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer {customerLabel} ?</DialogTitle>
          <DialogDescription>
            Cette action est définitive et ne peut pas être annulée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Seront supprimés :</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {counts.messages > 0
                  ? `La conversation et ses ${counts.messages} message${counts.messages > 1 ? "s" : ""}`
                  : "La conversation (aucun message)"}
              </li>
              <li>
                {counts.appointments > 0
                  ? `${counts.appointments} rendez-vous`
                  : "Aucun rendez-vous"}
              </li>
            </ul>
          </div>

          {counts.upcomingAppointments > 0 && (
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-destructive">
                Attention : {counts.upcomingAppointments} rendez-vous à venir
                {counts.upcomingAppointments > 1 ? " seront annulés" : " sera annulé"}.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Le compte du client n’est pas supprimé : il conserve son accès et ses éventuels liens
            avec d’autres artisans.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Annuler
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Supprimer définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
