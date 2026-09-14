import { Pencil } from "lucide-react";

import { DownloadInvoicePdfButton } from "@/components/invoices/download-invoice-pdf-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function InvoiceDocumentActionsCard({
  invoiceId,
  emissionFlow,
  isDraft,
}: {
  invoiceId: string;
  emissionFlow?: "e_invoicing" | "e_reporting" | null;
  isDraft: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Document facture</p>
      <p className="text-xs text-muted-foreground">
        {isDraft
          ? "Finalise la facture pour générer le PDF officiel, ou télécharge un aperçu si disponible."
          : "Télécharge le PDF et modifie les notes ou le statut dans le formulaire ci-dessous."}
      </p>
      <div className="flex flex-wrap gap-2">
        {!isDraft ? <DownloadInvoicePdfButton invoiceId={invoiceId} emissionFlow={emissionFlow} /> : null}
        <a href="#invoice-edit" className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center gap-2")}>
          <Pencil className="size-4" />
          Éditer la facture
        </a>
      </div>
    </div>
  );
}
