import { FileDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  invoiceId: string;
  emissionFlow?: "e_invoicing" | "e_reporting" | null;
};

export function DownloadInvoicePdfButton({ invoiceId, emissionFlow }: Props) {
  const isFacturX = emissionFlow !== "e_reporting";
  const href = isFacturX
    ? `/api/invoices/${invoiceId}/factur-x`
    : `/api/invoices/${invoiceId}/pdf`;
  const label = isFacturX ? "Télécharger Factur-X (PDF)" : "Télécharger le PDF";

  return (
    <a
      href={href}
      download
      className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center gap-2 no-underline")}
    >
      <FileDown className="h-4 w-4" />
      {label}
    </a>
  );
}
