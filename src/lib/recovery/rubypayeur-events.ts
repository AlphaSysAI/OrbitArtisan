import { z } from "zod";

import { normalizeRubypayeurStatus, type RubypayeurCaseStatus } from "@/lib/services/rubypayeur";

/** Événements de cycle de vie d'un dossier RubyPayeur. */
export const RUBYPAYEUR_EVENTS = [
  "case.accepted",
  "case.in_progress",
  "case.partially_collected",
  "case.collected",
  "case.failed",
  "case.canceled",
] as const;

export type RubypayeurEvent = (typeof RUBYPAYEUR_EVENTS)[number];

const MoneySchema = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
});

export const RubypayeurWebhookSchema = z
  .object({
    event: z.string().min(1),
    occurred_at: z.string().optional(),
    case_id: z.string().min(1).optional(),
    /** Identifiant interne renvoyé tel quel (id de la facture). */
    external_reference: z.string().optional(),
    status: z.string().optional(),
    /** Montant encaissé auprès du débiteur, en euros. */
    amount_collected: MoneySchema.optional(),
    /** Honoraires prélevés par RubyPayeur, en euros. */
    fee: MoneySchema.optional(),
    failure_reason: z.string().optional(),
  })
  .refine((data) => Boolean(data.case_id || data.external_reference), {
    message: "case_id ou external_reference requis",
  });

export type RubypayeurWebhookPayload = z.infer<typeof RubypayeurWebhookSchema>;

export type RubypayeurWebhookResult =
  | {
      ok: true;
      invoiceId: string;
      caseId: string;
      status: RubypayeurCaseStatus;
      ourCommission: number;
    }
  | { ok: false; code: "unknown_event" | "case_not_found" | "persist_failed"; message: string };

export function isKnownRubypayeurEvent(event: string): event is RubypayeurEvent {
  return (RUBYPAYEUR_EVENTS as readonly string[]).includes(event.trim().toLowerCase());
}

/** Statut de dossier déduit de l'événement, complété par le champ `status`. */
export function resolveCaseStatus(payload: RubypayeurWebhookPayload): RubypayeurCaseStatus {
  const event = payload.event.trim().toLowerCase();
  switch (event) {
    case "case.accepted":
      return "accepted";
    case "case.in_progress":
      return "in_progress";
    case "case.partially_collected":
      return "partially_collected";
    case "case.collected":
      return "collected";
    case "case.failed":
      return "failed";
    case "case.canceled":
      return "canceled";
    default:
      return normalizeRubypayeurStatus(payload.status);
  }
}

/** Correspondance dossier RubyPayeur → `invoices.recovery_status`. */
export function mapCaseStatusToRecoveryStatus(
  status: RubypayeurCaseStatus,
): "submitted_to_collection" | "in_progress" | "collected" | "failed" {
  switch (status) {
    case "submitted":
      return "submitted_to_collection";
    case "accepted":
    case "in_progress":
    case "partially_collected":
      return "in_progress";
    case "collected":
      return "collected";
    case "failed":
    case "canceled":
      return "failed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
