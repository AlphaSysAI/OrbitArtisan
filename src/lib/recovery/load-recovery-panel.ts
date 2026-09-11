import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFormalNoticeQuota, type FormalNoticeQuota } from "./formal-notice-quota";
import {
  normalizeRecoveryStatus,
  type DebtCollectionSummary,
  type FormalNoticeStatus,
  type FormalNoticeSummary,
  type RecoveryStatus,
} from "./types";

/** Retard minimal avant de proposer la mise en demeure. */
export const FORMAL_NOTICE_MIN_DAYS_OVERDUE = 30;
/** Retard minimal pour ouvrir le contentieux sans mise en demeure préalable. */
export const COLLECTION_MIN_DAYS_OVERDUE = 40;

export type RecoveryPanelData = {
  invoiceId: string;
  recoveryStatus: RecoveryStatus;
  amountDueCents: number;
  daysOverdue: number;
  notice: FormalNoticeSummary | null;
  collectionCase: DebtCollectionSummary | null;
  /** Quota LRAR du mois courant (1 incluse, non reportable). */
  quota: FormalNoticeQuota;
  /** La mise en demeure peut être déclenchée maintenant. */
  canSendFormalNotice: boolean;
  /** Le dossier peut être transmis au recouvrement contentieux. */
  canSubmitToCollection: boolean;
};

const ACTIVE_NOTICE_STATUSES: readonly FormalNoticeStatus[] = [
  "pending",
  "sent",
  "in_transit",
  "waiting_withdrawal",
  "delivered",
];

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000));
}

type FormalNoticeRow = {
  id: string;
  status: string;
  tracking_number: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  proof_storage_path: string | null;
  filing_proof_storage_path: string | null;
  failure_reason: string | null;
};

type DebtCollectionCaseRow = {
  id: string;
  rubypayeur_case_id: string | null;
  status: string;
  amount_total: number | null;
  amount_collected: number | null;
  created_at: string;
};

export type RecoveryPanelInvoice = {
  id: string;
  status: string;
  due_date: string | null;
  grand_total: number | null;
  recovery_status?: unknown;
};

/**
 * Charge l'état de recouvrement d'une facture pour la page de détail.
 * Repose sur la RLS : le client doit être authentifié en tant qu'artisan.
 *
 * Ne lève jamais : renvoie `null` si les tables de recouvrement sont
 * indisponibles (migration 11 non appliquée), pour que la page facture
 * reste affichable.
 */
export async function loadRecoveryPanelData(
  supabase: SupabaseClient,
  invoice: RecoveryPanelInvoice,
  artisanId: string,
): Promise<RecoveryPanelData | null> {
  const recoveryStatus = normalizeRecoveryStatus(invoice.recovery_status);
  const overdue = daysOverdue(invoice.due_date);
  const amountDueCents = Number(invoice.grand_total ?? 0);

  let noticeRow: FormalNoticeRow | null = null;
  let caseRow: DebtCollectionCaseRow | null = null;
  let quota: FormalNoticeQuota;

  try {
    const [notices, cases, resolvedQuota] = await Promise.all([
      supabase
        .from("formal_notices")
        .select(
          "id, status, tracking_number, sent_at, delivered_at, proof_storage_path, filing_proof_storage_path, failure_reason",
        )
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("debt_collection_cases")
        .select("id, rubypayeur_case_id, status, amount_total, amount_collected, created_at")
        .eq("invoice_id", invoice.id)
        .maybeSingle(),
      resolveFormalNoticeQuota(supabase, artisanId),
    ]);

    quota = resolvedQuota;

    if (notices.error && cases.error) {
      console.warn("[recovery] tables indisponibles", {
        invoiceId: invoice.id,
        message: notices.error.message,
      });
      return null;
    }

    noticeRow = (notices.data as FormalNoticeRow | null) ?? null;
    caseRow = (cases.data as DebtCollectionCaseRow | null) ?? null;
  } catch (error) {
    console.error("[recovery] chargement panneau", {
      invoiceId: invoice.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const notice: FormalNoticeSummary | null = noticeRow
    ? {
        id: noticeRow.id,
        status: noticeRow.status as FormalNoticeStatus,
        trackingNumber: noticeRow.tracking_number ?? null,
        sentAt: noticeRow.sent_at ?? null,
        deliveredAt: noticeRow.delivered_at ?? null,
        hasFilingProof: Boolean(noticeRow.filing_proof_storage_path),
        hasDeliveryProof: Boolean(noticeRow.proof_storage_path),
        failureReason: noticeRow.failure_reason ?? null,
      }
    : null;

  const collectionCase: DebtCollectionSummary | null = caseRow
    ? {
        id: caseRow.id,
        rubypayeurCaseId: caseRow.rubypayeur_case_id ?? null,
        status: caseRow.status,
        amountTotal: Number(caseRow.amount_total ?? 0),
        amountCollected: Number(caseRow.amount_collected ?? 0),
        createdAt: caseRow.created_at,
      }
    : null;

  const isUnpaid = invoice.status === "sent" || invoice.status === "overdue";
  const hasActiveNotice = notice !== null && ACTIVE_NOTICE_STATUSES.includes(notice.status);

  return {
    invoiceId: invoice.id,
    recoveryStatus,
    amountDueCents,
    daysOverdue: overdue,
    notice,
    collectionCase,
    quota,
    canSendFormalNotice:
      isUnpaid && !hasActiveNotice && collectionCase === null && overdue >= FORMAL_NOTICE_MIN_DAYS_OVERDUE,
    canSubmitToCollection:
      isUnpaid &&
      collectionCase === null &&
      amountDueCents > 0 &&
      (hasActiveNotice || overdue >= COLLECTION_MIN_DAYS_OVERDUE),
  };
}
