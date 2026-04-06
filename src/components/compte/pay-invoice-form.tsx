import { CreditCard } from "lucide-react";

import { startInvoicePayment } from "@/app/compte/factures/actions";
import { Button } from "@/components/ui/button";

export function PayInvoiceForm({ invoiceId }: { invoiceId: string }) {
  return (
    <form action={startInvoicePayment} className="inline">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Button type="submit" size="sm" className="gap-2">
        <CreditCard className="h-4 w-4" />
        Payer
      </Button>
    </form>
  );
}
