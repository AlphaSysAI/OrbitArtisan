import { z } from "zod";

import type { FormalNoticeStatus } from "./types";

/**
 * Événements `letter.*` du canal papier MySendingBox.
 * @see https://docs.mysendingbox.fr/ — « Event Type Letter »
 */
export const MYSENDINGBOX_LETTER_EVENTS = [
  "letter.created",
  "letter.accepted",
  "letter.filing_proof",
  "letter.sent",
  "letter.in_transit",
  "letter.waiting_to_be_withdrawn",
  "letter.distributed",
  "letter.delivery_proof",
  "letter.returned_to_sender",
  "letter.return_to_sender_proof",
  "letter.wrong_address",
  "letter.error",
  "letter.lost",
  "letter.canceled",
] as const;

export type MySendingBoxLetterEvent = (typeof MYSENDINGBOX_LETTER_EVENTS)[number];

const FileSchema = z
  .object({
    _id: z.string().optional(),
    url: z.string().url(),
    type: z.string().optional(),
  })
  .nullable()
  .optional();

export const MySendingBoxWebhookSchema = z.object({
  created_at: z.string().optional(),
  event: z.object({
    _id: z.string().optional(),
    name: z.string().min(1),
    category: z.string().optional(),
    description: z.string().optional(),
    additional_info: z.string().optional(),
    letter: z.string().optional(),
  }),
  letter: z
    .object({
      _id: z.string().min(1),
      tracking_number: z.string().nullable().optional(),
      wrong_address: z.boolean().optional(),
      returnToSenderReason: z.string().nullable().optional(),
      filing_proof: FileSchema,
      delivery_proof: FileSchema,
      return_to_sender_proof: FileSchema,
    })
    .optional(),
});

export type MySendingBoxWebhookPayload = z.infer<typeof MySendingBoxWebhookSchema>;

export function isKnownLetterEvent(name: string): name is MySendingBoxLetterEvent {
  return (MYSENDINGBOX_LETTER_EVENTS as readonly string[]).includes(name);
}

/**
 * Statut interne correspondant à l'événement, ou `null` si l'événement ne fait
 * pas progresser l'acheminement (ex. `letter.created` déjà pris en compte).
 */
export function mapLetterEventToStatus(event: MySendingBoxLetterEvent): FormalNoticeStatus | null {
  switch (event) {
    case "letter.created":
      return null;
    case "letter.accepted":
    case "letter.filing_proof":
    case "letter.sent":
      return "sent";
    case "letter.in_transit":
      return "in_transit";
    case "letter.waiting_to_be_withdrawn":
      return "waiting_withdrawal";
    case "letter.distributed":
    case "letter.delivery_proof":
      return "delivered";
    case "letter.returned_to_sender":
    case "letter.return_to_sender_proof":
      return "returned";
    case "letter.wrong_address":
      return "wrong_address";
    case "letter.error":
    case "letter.lost":
      return "failed";
    case "letter.canceled":
      return "canceled";
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Ordre d'acheminement : empêche un webhook livré en retard de faire régresser
 * un statut déjà plus avancé.
 */
const STATUS_RANK: Record<FormalNoticeStatus, number> = {
  pending: 0,
  sent: 1,
  in_transit: 2,
  waiting_withdrawal: 3,
  delivered: 4,
  returned: 4,
  wrong_address: 4,
  failed: 5,
  canceled: 5,
};

export function shouldApplyStatus(
  current: FormalNoticeStatus,
  next: FormalNoticeStatus,
): boolean {
  return STATUS_RANK[next] >= STATUS_RANK[current];
}
