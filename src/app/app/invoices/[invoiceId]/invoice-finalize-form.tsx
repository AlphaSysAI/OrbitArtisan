"use client";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import { finalizeInvoiceDetailForm } from "./invoice-detail-actions";

export function InvoiceFinalizeForm({ invoiceId }: { invoiceId: string }) {
  return (
    <form action={finalizeInvoiceDetailForm}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Button type="submit" className="gap-2">
        <Send className="h-4 w-4" />
        Finaliser et émettre
      </Button>
    </form>
  );
}
