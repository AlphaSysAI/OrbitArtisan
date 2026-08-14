import { z } from "zod";

/** Événements remontés par la Plateforme Agréée (PA). */
export const PA_WEBHOOK_EVENT_TYPES = [
  "RECEIVED_BY_PLATFORM",
  "TRANSMITTED",
  "APPROVED",
  "ACCEPTED",
  "REJECTED",
  "REFUSED",
  "PAYMENT_RECEIVED",
] as const;

export type PaWebhookEventType = (typeof PA_WEBHOOK_EVENT_TYPES)[number];

export const PaWebhookPayloadSchema = z
  .object({
    event: z.enum(PA_WEBHOOK_EVENT_TYPES),
    submissionId: z.string().min(1).optional(),
    invoiceId: z.string().uuid().optional(),
    occurredAt: z.string().optional(),
    rejectionReason: z.string().optional(),
    rejectionCode: z.string().optional(),
    paymentAmountCents: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
  })
  .refine((data) => Boolean(data.submissionId || data.invoiceId), {
    message: "submissionId ou invoiceId requis",
  });

export type PaWebhookPayload = z.infer<typeof PaWebhookPayloadSchema>;

/** Statuts fiscaux persistés en BDD (`e_invoicing_status`). */
export type FiscalEInvoicingStatus =
  | "DRAFT"
  | "DEPOSITED"
  | "RECEIVED_BY_PLATFORM"
  | "TRANSMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export type PaWebhookProcessingResult =
  | { ok: true; invoiceId: string; fiscalStatus: FiscalEInvoicingStatus }
  | { ok: false; code: "invalid_payload" | "invoice_not_found" | "persist_failed"; message: string };

/** Mappe un événement PA vers le statut fiscal interne. */
export function mapPaEventToFiscalStatus(event: PaWebhookEventType): FiscalEInvoicingStatus {
  switch (event) {
    case "RECEIVED_BY_PLATFORM":
      return "RECEIVED_BY_PLATFORM";
    case "TRANSMITTED":
      return "TRANSMITTED";
    case "APPROVED":
    case "ACCEPTED":
      return "APPROVED";
    case "REJECTED":
    case "REFUSED":
      return "REJECTED";
    case "PAYMENT_RECEIVED":
      return "PAID";
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function normalizePaWebhookEvent(event: string): PaWebhookEventType | null {
  const upper = event.trim().toUpperCase();
  return (PA_WEBHOOK_EVENT_TYPES as readonly string[]).includes(upper)
    ? (upper as PaWebhookEventType)
    : null;
}

export function buildRejectionReason(payload: PaWebhookPayload): string | null {
  const parts = [payload.rejectionReason?.trim(), payload.rejectionCode?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : null;
}
