"use client";

import { Send } from "lucide-react";
import { useFormStatus } from "react-dom";

import { finalizeInvoiceForm } from "@/app/app/invoices/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SubmitLabel() {
  const { pending } = useFormStatus();
  return pending ? "Finalisation…" : "Finaliser et émettre";
}

export function FinalizeInvoiceButton({ invoiceId }: { invoiceId: string }) {
  return (
    <form action={finalizeInvoiceForm}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button
        type="submit"
        className={cn(buttonVariants({ variant: "default" }), "inline-flex items-center gap-2")}
      >
        <Send className="h-4 w-4" />
        <SubmitLabel />
      </button>
    </form>
  );
}
