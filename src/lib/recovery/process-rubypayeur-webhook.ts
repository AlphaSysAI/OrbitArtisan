import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeOurCommission } from "@/lib/services/rubypayeur";

import {
  mapCaseStatusToRecoveryStatus,
  resolveCaseStatus,
  type RubypayeurWebhookPayload,
  type RubypayeurWebhookResult,
} from "./rubypayeur-events";

type CaseRow = {
  id: string;
  invoice_id: string;
  rubypayeur_case_id: string | null;
  amount_total: number;
  amount_collected: number;
  rubypayeur_fee: number;
  our_commission: number;
};

async function findCase(
  admin: SupabaseClient,
  payload: RubypayeurWebhookPayload,
): Promise<CaseRow | null> {
  const columns =
    "id, invoice_id, rubypayeur_case_id, amount_total, amount_collected, rubypayeur_fee, our_commission";

  if (payload.case_id) {
    const { data } = await admin
      .from("debt_collection_cases")
      .select(columns)
      .eq("rubypayeur_case_id", payload.case_id)
      .maybeSingle();
    if (data) return data as CaseRow;
  }

  if (payload.external_reference) {
    const { data } = await admin
      .from("debt_collection_cases")
      .select(columns)
      .eq("invoice_id", payload.external_reference)
      .maybeSingle();
    if (data) return data as CaseRow;
  }

  return null;
}

export async function processRubypayeurWebhook(
  admin: SupabaseClient,
  payload: RubypayeurWebhookPayload,
): Promise<RubypayeurWebhookResult> {
  const collectionCase = await findCase(admin, payload);
  if (!collectionCase) {
    return {
      ok: false,
      code: "case_not_found",
      message: "Aucun dossier de recouvrement ne correspond à cet événement.",
    };
  }

  const status = resolveCaseStatus(payload);
  const occurredAt = payload.occurred_at ?? new Date().toISOString();
  const isTerminal = status === "collected" || status === "failed" || status === "canceled";

  const update: Record<string, unknown> = { status };

  if (payload.case_id && !collectionCase.rubypayeur_case_id) {
    update.rubypayeur_case_id = payload.case_id;
  }

  if (payload.amount_collected != null) {
    update.amount_collected = Number(payload.amount_collected.toFixed(2));
  }

  if (payload.fee != null) {
    const fee = Number(payload.fee.toFixed(2));
    update.rubypayeur_fee = fee;
    // Rétrocession apporteur d'affaires assise sur les honoraires du prestataire.
    update.our_commission = computeOurCommission(fee);
  }

  if (status === "failed" || status === "canceled") {
    update.failure_reason = (payload.failure_reason ?? payload.event).slice(0, 500);
  }

  if (isTerminal) {
    update.closed_at = occurredAt;
  }

  const { error: caseError } = await admin
    .from("debt_collection_cases")
    .update(update)
    .eq("id", collectionCase.id);

  if (caseError) {
    console.error("[rubypayeur webhook] MAJ dossier", caseError);
    return { ok: false, code: "persist_failed", message: "Mise à jour du dossier impossible." };
  }

  const invoiceUpdate: Record<string, unknown> = {
    recovery_status: mapCaseStatusToRecoveryStatus(status),
  };

  if (status === "collected") {
    invoiceUpdate.status = "paid";
    invoiceUpdate.payment_received_at = occurredAt;
  }

  const { error: invoiceError } = await admin
    .from("invoices")
    .update(invoiceUpdate)
    .eq("id", collectionCase.invoice_id);

  if (invoiceError) {
    console.error("[rubypayeur webhook] MAJ facture", invoiceError);
    return { ok: false, code: "persist_failed", message: "Mise à jour de la facture impossible." };
  }

  const ourCommission =
    (update.our_commission as number | undefined) ?? collectionCase.our_commission ?? 0;

  return {
    ok: true,
    invoiceId: collectionCase.invoice_id,
    caseId: collectionCase.rubypayeur_case_id ?? payload.case_id ?? collectionCase.id,
    status,
    ourCommission,
  };
}
