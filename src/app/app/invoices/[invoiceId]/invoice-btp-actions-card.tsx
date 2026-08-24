import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { createCreditNoteForm, releaseRetentionForm } from "../btp-actions";

export function InvoiceBtpActionsCard({
  invoiceId,
  retentionAmount,
  retentionReleasedAt,
}: {
  invoiceId: string;
  retentionAmount: number;
  retentionReleasedAt: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Actions BTP</CardTitle>
        <CardDescription>Avoir, retenue de garantie</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <form action={createCreditNoteForm}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <Button type="submit" variant="outline" size="sm">
            Créer un avoir
          </Button>
        </form>
        {retentionAmount > 0 && !retentionReleasedAt ? (
          <form action={releaseRetentionForm}>
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <Button type="submit" variant="outline" size="sm">
              Libérer retenue (
              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(retentionAmount / 100)}
              )
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
