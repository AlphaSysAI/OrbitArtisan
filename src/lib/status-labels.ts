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

const E_INVOICING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon e-facture",
  DEPOSITED: "Déposée",
  RECEIVED_BY_PLATFORM: "Reçue par la PA",
  TRANSMITTED: "Transmise au client",
  APPROVED: "Validée client",
  REJECTED: "Refusée",
  PAID: "Encaissée (PA)",
};

/** Variante de badge UI selon le statut fiscal. */
export function eInvoicingStatusBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "APPROVED":
    case "PAID":
      return "default";
    case "REJECTED":
      return "destructive";
    case "DRAFT":
      return "secondary";
    case "RECEIVED_BY_PLATFORM":
    case "DEPOSITED":
    case "TRANSMITTED":
    default:
      return "outline";
  }
}

const INVOICE_OPERATION_TYPE_LABELS: Record<string, string> = {
  livraison_biens: "Livraison de biens",
  prestation_services: "Prestation de services",
  mixte: "Mixte (biens + services)",
};

const VAT_COLLECTION_NATURE_LABELS: Record<string, string> = {
  on_delivery: "TVA à la livraison",
  on_payment: "TVA à l'encaissement",
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

export function eInvoicingStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return E_INVOICING_STATUS_LABELS[status] ?? UNKNOWN_STATUS;
}

export function invoiceOperationTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return INVOICE_OPERATION_TYPE_LABELS[type] ?? type;
}

export function vatCollectionNatureLabel(nature: string | null | undefined): string {
  if (!nature) return "—";
  return VAT_COLLECTION_NATURE_LABELS[nature] ?? nature;
}
