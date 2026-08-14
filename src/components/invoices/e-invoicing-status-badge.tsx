import { Badge } from "@/components/ui/badge";
import { eInvoicingStatusBadgeVariant, eInvoicingStatusLabel } from "@/lib/status-labels";

type Props = {
  status: string | null | undefined;
  emissionFlow?: "e_invoicing" | "e_reporting" | null;
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

  if (!status || status === "DRAFT") {
    return null;
  }

  return (
    <Badge variant={eInvoicingStatusBadgeVariant(status)} className={className}>
      {eInvoicingStatusLabel(status)}
    </Badge>
  );
}
