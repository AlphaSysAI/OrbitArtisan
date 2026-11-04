"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { deleteMyAccountAction, type DeleteAccountState } from "@/app/app/reglages/account-deletion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Zone « Supprimer mon compte » (Réglages › Abonnement). */
export function DeleteAccountSection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccountAction, { error: null });

  return (
    <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold">Supprimer mon compte</h2>
        <p className="text-sm text-muted-foreground">
          Résilie immédiatement l&apos;abonnement et efface définitivement vos données 30 jours plus tard.
        </p>
      </div>

      {!open ? (
        <Button type="button" variant="outline" className="border-destructive/40 text-destructive" onClick={() => setOpen(true)}>
          Supprimer mon compte…
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl bg-background p-4 text-sm">
            <p className="font-medium">Avant de continuer :</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Exportez vos documents.</strong> Vous devez conserver vos factures et devis pendant 10 ans.{" "}
                <a href="/api/invoices/export-accounting" className="underline underline-offset-4">
                  Télécharger le récapitulatif des factures (CSV)
                </a>{" "}
                · PDF depuis{" "}
                <Link href="/app/invoices" className="underline underline-offset-4">
                  Factures
                </Link>{" "}
                et{" "}
                <Link href="/app/quotes" className="underline underline-offset-4">
                  Devis
                </Link>
                .
              </li>
              <li>
                <strong>Abonnement résilié tout de suite</strong>, sans remboursement de la période en cours déjà payée
                (mensuelle ou annuelle). Si vous bénéficiez du droit de rétractation (CGV, art. 11), exercez-le par e-mail
                plutôt qu&apos;ici.
              </li>
              <li>Accès fermé, numéro Soline désactivé, plus aucune demande de chantier.</li>
              <li>
                <strong>Effacement définitif après 30 jours</strong> : fiche, clients, devis, factures, appels, fichiers.
                Pendant ce délai, une copie des données ou l&apos;annulation peut être demandée par e-mail.
              </li>
            </ul>
          </div>

          <form action={action} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="confirm_email">Pour confirmer, saisissez l&apos;adresse de votre compte</Label>
              <Input id="confirm_email" name="confirm_email" type="email" autoComplete="off" placeholder={email} required />
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="confirm_terms" value="1" required className="mt-0.5 size-4" />
              <span>J&apos;ai exporté ce que je dois conserver et je comprends que la suppression est définitive après 30 jours.</span>
            </label>
            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
              </Button>
              <button type="button" className={buttonVariants({ variant: "ghost" })} onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
