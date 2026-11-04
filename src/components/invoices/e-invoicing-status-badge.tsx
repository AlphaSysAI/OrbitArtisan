import { Badge } from "@/components/ui/badge";
import { eInvoicingStatusBadgeVariant, eInvoicingStatusLabel } from "@/lib/status-labels";

type Props = {
  status: string | null | undefined;
  emissionFlow?: "e_invoicing" | "e_reporting" | "pdf_transition" | null;
  className?: string;
};

export function EInvoicingStatusBadge({ status, emissionFlow, className }: Props) {
  if (emissionFlow === "e_reporting") {
    return (
      <Badge variant="outline" className={className}>
        E-reporting (B2C)
      </Badge>
    );
  }

  if (emissionFlow === "pdf_transition") {
    return (
      <Badge variant="outline" className={className}>
        PDF (B2B transitoire)
      </Badge>
    );
  }

  if (!status || status === "DRAFT") {
    return null;
  }

  return (
    <Badge variant={eInvoicingStatusBadgeVariant(status)} className={className}>
      {eInvoicingStatusLabel(status)}
    </Badge>
  );
}
