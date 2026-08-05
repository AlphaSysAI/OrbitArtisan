const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Refusé",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  cancelled: "Annulé",
};

const INVOICE_LINE_KIND_LABELS: Record<string, string> = {
  labor: "Main d’œuvre",
  service: "Prestation",
  material: "Matériau",
};

const UNKNOWN_STATUS = "Statut inconnu";

export function quoteStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return QUOTE_STATUS_LABELS[status] ?? UNKNOWN_STATUS;
}

export function invoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return INVOICE_STATUS_LABELS[status] ?? UNKNOWN_STATUS;
}

export function appointmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return APPOINTMENT_STATUS_LABELS[status] ?? UNKNOWN_STATUS;
}

export function invoiceLineKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return INVOICE_LINE_KIND_LABELS[kind] ?? kind;
}
