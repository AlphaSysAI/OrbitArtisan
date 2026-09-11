import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { downloadLetterFile } from "@/lib/services/mysendingbox";

import {
  isKnownLetterEvent,
  mapLetterEventToStatus,
  shouldApplyStatus,
  type MySendingBoxWebhookPayload,
} from "./mysendingbox-events";
import { buildRecoveryDocumentPath, uploadRecoveryDocument } from "./storage";
import type { FormalNoticeStatus } from "./types";

export type MySendingBoxWebhookResult =
  | { ok: true; invoiceId: string; noticeId: string; status: FormalNoticeStatus; ignored?: boolean }
  | { ok: false; code: "unknown_event" | "letter_not_found" | "persist_failed"; message: string };

type NoticeRow = {
  id: string;
  invoice_id: string;
  artisan_id: string;
  status: FormalNoticeStatus;
  proof_storage_path: string | null;
  filing_proof_storage_path: string | null;
};

/**
 * Archive une preuve La Poste dans le bucket de recouvrement.
 * Échec non bloquant : le statut de la lettre reste la donnée prioritaire.
 */
async function archiveProof(
  admin: SupabaseClient,
  notice: NoticeRow,
  url: string,
  kind: "filing-proof" | "delivery-proof" | "return-proof",
): Promise<string | null> {
  const downloaded = await downloadLetterFile(url);
  if (!downloaded.ok) {
    console.warn("[mysendingbox webhook] téléchargement preuve", {
      noticeId: notice.id,
      kind,
      error: downloaded.error,
    });
    return null;
  }

  const path = buildRecoveryDocumentPath({
    artisanId: notice.artisan_id,
    invoiceId: notice.invoice_id,
    kind,
    suffix: notice.id.slice(0, 8),
  });

  const uploaded = await uploadRecoveryDocument(admin, path, downloaded.data);
  return uploaded.ok ? path : null;
}

export async function processMySendingBoxWebhook(
  admin: SupabaseClient,
  payload: MySendingBoxWebhookPayload,
): Promise<MySendingBoxWebhookResult> {
  const eventName = payload.event.name;
  if (!isKnownLetterEvent(eventName)) {
    return { ok: false, code: "unknown_event", message: `Événement non géré : ${eventName}` };
  }

  const letterId = payload.letter?._id ?? payload.event.letter;
  if (!letterId) {
    return { ok: false, code: "letter_not_found", message: "Identifiant de lettre absent." };
  }

  const { data, error } = await admin
    .from("formal_notices")
    .select("id, invoice_id, artisan_id, status, proof_storage_path, filing_proof_storage_path")
    .eq("mysendingbox_letter_id", letterId)
    .maybeSingle();

  if (error) {
    console.error("[mysendingbox webhook] lecture mise en demeure", error);
    return { ok: false, code: "persist_failed", message: "Lecture impossible." };
  }
  if (!data) {
    return {
      ok: false,
      code: "letter_not_found",
      message: `Aucune mise en demeure pour la lettre ${letterId}.`,
    };
  }

  const notice = data as NoticeRow;
  const nextStatus = mapLetterEventToStatus(eventName);
  const occurredAt = payload.created_at ?? new Date().toISOString();

  const update: Record<string, unknown> = { last_event: eventName };

  if (nextStatus && shouldApplyStatus(notice.status, nextStatus)) {
    update.status = nextStatus;
    if (nextStatus === "delivered") update.delivered_at = occurredAt;
  }

  if (payload.letter?.tracking_number) {
    update.tracking_number = payload.letter.tracking_number;
  }

  if (eventName === "letter.wrong_address") {
    update.failure_reason = (payload.event.additional_info ?? "Adresse erronée (NPAI)").slice(0, 500);
  } else if (eventName === "letter.returned_to_sender" || eventName === "letter.return_to_sender_proof") {
    update.failure_reason = (
      payload.letter?.returnToSenderReason ?? payload.event.description ?? "Retour à l'expéditeur"
    ).slice(0, 500);
  } else if (eventName === "letter.error" || eventName === "letter.lost") {
    update.failure_reason = (payload.event.description ?? eventName).slice(0, 500);
  }

  // Preuve de dépôt : établit la date d'envoi opposable de la mise en demeure.
  const filingProofUrl = payload.letter?.filing_proof?.url;
  if (filingProofUrl && !notice.filing_proof_storage_path) {
    const path = await archiveProof(admin, notice, filingProofUrl, "filing-proof");
    if (path) update.filing_proof_storage_path = path;
  }

  // Accusé de réception : pièce maîtresse du dossier contentieux.
  const deliveryProofUrl =
    payload.letter?.delivery_proof?.url ?? payload.letter?.return_to_sender_proof?.url;
  if (deliveryProofUrl && !notice.proof_storage_path) {
    const kind = payload.letter?.delivery_proof?.url ? "delivery-proof" : "return-proof";
    const path = await archiveProof(admin, notice, deliveryProofUrl, kind);
    if (path) update.proof_storage_path = path;
  }

  const { error: updateError } = await admin
    .from("formal_notices")
    .update(update)
    .eq("id", notice.id);

  if (updateError) {
    console.error("[mysendingbox webhook] MAJ mise en demeure", updateError);
    return { ok: false, code: "persist_failed", message: "Mise à jour impossible." };
  }

  // Une LRAR non distribuable rouvre la décision côté artisan.
  if (nextStatus === "failed" || nextStatus === "wrong_address" || nextStatus === "returned") {
    const { error: invoiceError } = await admin
      .from("invoices")
      .update({ recovery_status: "failed" })
      .eq("id", notice.invoice_id)
      .eq("recovery_status", "formal_notice_sent");
    if (invoiceError) {
      console.warn("[mysendingbox webhook] MAJ statut facture", invoiceError);
    }
  }

  const resolvedStatus = (update.status as FormalNoticeStatus | undefined) ?? notice.status;

  return {
    ok: true,
    invoiceId: notice.invoice_id,
    noticeId: notice.id,
    status: resolvedStatus,
    ignored: nextStatus === null,
  };
}
