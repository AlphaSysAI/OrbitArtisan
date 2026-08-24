import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";

export default function InvoiceNotFound() {
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
