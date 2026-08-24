"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button-variants";

export default function InvoiceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[invoice-detail-error]", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold">Impossible d&apos;afficher cette facture</h2>
      <p className="text-sm text-muted-foreground">
        Une erreur serveur s&apos;est produite lors du chargement. Tu peux réessayer ou revenir à la liste des
        factures.
        {error.digest ? (
          <>
            {" "}
            Référence : <span className="font-mono text-xs">{error.digest}</span>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className={buttonVariants({ variant: "default", size: "sm" })}>
          Réessayer
        </button>
        <Link href="/app/invoices" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Retour aux factures
        </Link>
      </div>
    </div>
  );
}
