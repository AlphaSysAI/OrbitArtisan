import { FileDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function ClientInvoicePdfButton({
  invoiceId,
  emissionFlow,
  className,
}: {
  invoiceId: string;
  emissionFlow?: "e_invoicing" | "e_reporting" | null;
  className?: string;
}) {
  const href =
    emissionFlow === "e_reporting"
      ? `/api/invoices/${invoiceId}/pdf`
      : `/api/invoices/${invoiceId}/factur-x`;
  const label = emissionFlow === "e_reporting" ? "Télécharger le PDF" : "Télécharger la facture (PDF)";

  return (
    <a
      href={href}
      download
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center gap-2 no-underline", className)}
    >
      <FileDown className="size-4" />
      {label}
    </a>
  );
}
