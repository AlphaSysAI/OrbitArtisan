import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";

export function InvoiceAccessDeniedPanel() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-6">
      <h2 className="text-lg font-semibold">Facture introuvable</h2>
      <p className="text-sm text-muted-foreground">
        Cette facture n&apos;existe pas ou tu n&apos;y as pas accès.
      </p>
      <Link href="/app/invoices" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Retour aux factures
      </Link>
    </div>
  );
}

export function InvoiceLoadErrorPanel() {
  return (
    <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold">Impossible de charger cette facture</h2>
      <p className="text-sm text-muted-foreground">
        La base de données a renvoyé une erreur inattendue. Réessaie dans un instant ou contacte le support.
      </p>
      <Link href="/app/invoices" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Retour aux factures
      </Link>
    </div>
  );
}
