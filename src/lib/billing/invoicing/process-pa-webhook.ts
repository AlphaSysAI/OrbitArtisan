import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildRejectionReason,
  mapPaEventToFiscalStatus,
  type PaWebhookPayload,
  type PaWebhookProcessingResult,
} from "./pa-webhook-events";

type InvoiceLookupRow = {
  id: string;
  status: string;
  grand_total: number;
  emission_flow: string | null;
};

export async function processPaWebhookEvent(
  admin: SupabaseClient,
  payload: PaWebhookPayload,
): Promise<PaWebhookProcessingResult> {
  const invoice = await findInvoice(admin, payload);
  if (!invoice) {
    return { ok: false, code: "invoice_not_found", message: "Facture introuvable pour cet événement PA." };
  }

  const fiscalStatus = mapPaEventToFiscalStatus(payload.event);
  const now = payload.occurredAt ?? new Date().toISOString();
  const rejectionReason = buildRejectionReason(payload);

  const update: Record<string, unknown> = {
    e_invoicing_status: fiscalStatus,
    e_invoicing_status_updated_at: now,
    pa_submission_status: payload.event,
  };

  if (payload.submissionId) {
    update.pa_submission_id = payload.submissionId;
  }

  if (fiscalStatus === "REJECTED") {
    update.e_invoicing_rejection_reason = rejectionReason ?? "Refus sans motif détaillé.";
  }

  if (fiscalStatus === "PAID") {
    update.payment_received_at = now;
    if (invoice.status === "sent") {
      update.status = "paid";
    }
    if (
      payload.paymentAmountCents != null &&
      payload.paymentAmountCents !== invoice.grand_total
    ) {
      console.warn("[PA webhook] Montant encaissement différent du total facture", {
        invoiceId: invoice.id,
        expected: invoice.grand_total,
        received: payload.paymentAmountCents,
      });
    }
  }

  const { error: updateError } = await admin.from("invoices").update(update).eq("id", invoice.id);
  if (updateError) {
    console.error("[PA webhook] MAJ facture", updateError);
    return { ok: false, code: "persist_failed", message: "Impossible de mettre à jour la facture." };
  }

  const { error: logError } = await admin.from("pa_webhook_events").insert({
    invoice_id: invoice.id,
    pa_submission_id: payload.submissionId ?? null,
    event_type: payload.event,
    payload,
  });

  if (logError) {
    // Non bloquant : la facture est déjà à jour.
    console.warn("[PA webhook] Journalisation événement", logError);
  }

  return { ok: true, invoiceId: invoice.id, fiscalStatus };
}

async function findInvoice(
  admin: SupabaseClient,
  payload: PaWebhookPayload,
): Promise<InvoiceLookupRow | null> {
  if (payload.invoiceId) {
    const { data } = await admin
      .from("invoices")
      .select("id, status, grand_total, emission_flow")
      .eq("id", payload.invoiceId)
      .maybeSingle();
    return data as InvoiceLookupRow | null;
  }

  if (payload.submissionId) {
    const { data } = await admin
      .from("invoices")
      .select("id, status, grand_total, emission_flow")
      .eq("pa_submission_id", payload.submissionId)
      .maybeSingle();
    return data as InvoiceLookupRow | null;
  }

  return null;
}
