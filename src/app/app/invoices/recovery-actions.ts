"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadFacturXDocumentFromDb } from "@/lib/billing/facturx/load-from-db";
import { renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";
import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { FORMAL_NOTICES_INCLUDED_PER_MONTH } from "@/lib/billing/subscription-plans";
import {
  getFormalNoticeQuotaPeriod,
  resolveFormalNoticeQuota,
} from "@/lib/recovery/formal-notice-quota";
import { loadRecoveryContext, type RecoveryContext } from "@/lib/recovery/load-recovery-context";
import { renderFormalNoticePdf } from "@/lib/recovery/render-formal-notice-pdf";
import {
  buildRecoveryDocumentPath,
  createRecoveryDocumentSignedUrl,
  uploadRecoveryDocument,
} from "@/lib/recovery/storage";
import {
  sendFormalNoticeLRAR,
  type MySendingBoxAddress,
} from "@/lib/services/mysendingbox";
import { createRecoveryCase, type RubypayeurDocument } from "@/lib/services/rubypayeur";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RecoveryActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Délai minimal avant transmission au recouvrement contentieux, en jours. */
const COLLECTION_MIN_DAYS_OVERDUE = 40;

function revalidateRecoveryPaths(invoiceId: string) {
  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app");
}

type AuthenticatedCaller = {
  supabase: SupabaseClient;
  userId: string;
  artisanId: string;
};

async function authenticateArtisan(): Promise<
  { ok: true; caller: AuthenticatedCaller } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.id) return { ok: false, error: "profile" };

  return { ok: true, caller: { supabase, userId: user.id, artisanId: profile.id } };
}

function toMySendingBoxAddress(party: {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
}): MySendingBoxAddress {
  return {
    name: party.name,
    address_line1: party.addressLine1 ?? "",
    address_line2: party.addressLine2 ?? null,
    address_city: party.city ?? "",
    address_postalcode: party.postalCode ?? "",
    address_country: party.countryCode === "FR" ? "France" : party.countryCode,
  };
}

/**
 * Phase pré-contentieuse — génère la mise en demeure et l'expédie en LRAR
 * papier (impression et distribution La Poste) via MySendingBox.
 *
 * L'abonnement inclut une lettre par mois civil. Au-delà, l'affranchissement
 * est refacturé à l'artisan : l'envoi exige alors `acceptExtraCost`, afin que
 * personne ne soit facturé sans l'avoir accepté explicitement.
 */
export async function sendFormalNoticeAction(
  invoiceId: string,
  options: { acceptExtraCost?: boolean } = {},
): Promise<RecoveryActionResult> {
  const auth = await authenticateArtisan();
  if (!auth.ok) return auth;
  const { supabase, userId, artisanId } = auth.caller;

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return { ok: false, error: "service_unavailable" };

  const loaded = await loadRecoveryContext(supabase, invoiceId, artisanId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { invoice, creditor, debtor } = loaded.context;

  if (!["sent", "overdue"].includes(invoice.status)) {
    return { ok: false, error: "invalid_status" };
  }

  const quota = await resolveFormalNoticeQuota(supabase, artisanId);
  if (quota.nextIsBillable && options.acceptExtraCost !== true) {
    return { ok: false, error: "extra_cost_consent_required" };
  }

  // Idempotence métier : une seule mise en demeure active par facture.
  const { data: existing } = await supabase
    .from("formal_notices")
    .select("id, status")
    .eq("invoice_id", invoice.id)
    .not("status", "in", "(failed,canceled)")
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: "already_sent" };

  const { data: notice, error: insertError } = await supabase
    .from("formal_notices")
    .insert({
      invoice_id: invoice.id,
      artisan_id: artisanId,
      user_id: userId,
      status: "pending",
      amount_claimed_cents: invoice.grandTotalCents,
      billed_to_artisan: quota.nextIsBillable,
    })
    .select("id")
    .single();

  if (insertError || !notice?.id) {
    console.error("[recovery] insertion mise en demeure", insertError);
    return { ok: false, error: "persist_failed" };
  }

  const failNotice = async (reason: string) => {
    // Rien n'a été affranchi : la lettre ne consomme ni ne facture le quota.
    await admin
      .from("formal_notices")
      .update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
        billed_to_artisan: false,
      })
      .eq("id", notice.id);
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderFormalNoticePdf({
      invoiceNumber: invoice.invoiceNumber,
      invoiceIssueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      amountDueCents: invoice.grandTotalCents,
      creditor,
      debtor,
      isBusinessDebtor: debtor.isBusiness,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[recovery] génération PDF mise en demeure", { invoiceId, reason });
    await failNotice(`pdf_failed: ${reason}`);
    return { ok: false, error: "pdf_failed" };
  }

  const pdfPath = buildRecoveryDocumentPath({
    artisanId,
    invoiceId: invoice.id,
    kind: "formal-notice",
    suffix: notice.id.slice(0, 8),
  });

  const uploaded = await uploadRecoveryDocument(admin, pdfPath, pdfBytes);
  if (!uploaded.ok) {
    await failNotice(uploaded.error);
    return { ok: false, error: "storage_failed" };
  }

  const signedUrl = await createRecoveryDocumentSignedUrl(admin, pdfPath);
  if (!signedUrl.ok) {
    await failNotice(signedUrl.error);
    return { ok: false, error: "storage_failed" };
  }

  const sent = await sendFormalNoticeLRAR({
    from: toMySendingBoxAddress(creditor),
    to: toMySendingBoxAddress(debtor),
    source: { kind: "remote", url: signedUrl.data },
    description: `Mise en demeure — facture ${invoice.invoiceNumber}`,
    // Une mise en demeure ne doit pas attendre : dépôt au plus tôt.
    postageSpeed: "express",
    manageReturnedMail: true,
    // Rejouer l'action ne réaffranchit pas la lettre (fenêtre 24 h).
    idempotencyKey: notice.id,
  });

  if (!sent.ok) {
    console.error("[recovery] envoi LRAR", { invoiceId, error: sent.error });
    await failNotice(sent.error);
    return { ok: false, error: sent.error.startsWith("mysendingbox_not_configured") ? "not_configured" : "send_failed" };
  }

  const { error: updateError } = await admin
    .from("formal_notices")
    .update({
      mysendingbox_letter_id: sent.data._id,
      tracking_number: sent.data.tracking_number ?? null,
      pdf_storage_path: pdfPath,
      status: "sent",
      last_event: "letter.created",
      sent_at: new Date().toISOString(),
    })
    .eq("id", notice.id);

  if (updateError) {
    // La lettre est affranchie : on trace sans faire échouer l'action.
    console.error("[recovery] MAJ mise en demeure après envoi", {
      invoiceId,
      letterId: sent.data._id,
      message: updateError.message,
    });
  } else {
    await reconcileQuotaBilling(admin, artisanId, notice.id);
  }

  const { error: invoiceError } = await admin
    .from("invoices")
    .update({ recovery_status: "formal_notice_sent" })
    .eq("id", invoice.id);

  if (invoiceError) {
    console.error("[recovery] MAJ statut facture", { invoiceId, message: invoiceError.message });
  }

  revalidateRecoveryPaths(invoice.id);
  return { ok: true };
}

/**
 * Fixe le caractère facturable d'une lettre une fois l'affranchissement acquis.
 *
 * Le quota est vérifié avant l'envoi, mais deux envois simultanés pourraient
 * tous deux se croire inclus. On recompte donc les lettres antérieures de la
 * période : seules les premières `included` restent offertes.
 */
async function reconcileQuotaBilling(
  admin: SupabaseClient,
  artisanId: string,
  noticeId: string,
): Promise<void> {
  const { start, end } = getFormalNoticeQuotaPeriod();

  const { data: franked, error } = await admin
    .from("formal_notices")
    .select("id")
    .eq("artisan_id", artisanId)
    .not("mysendingbox_letter_id", "is", null)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (error || !franked) {
    console.warn("[recovery] réconciliation quota", { artisanId, message: error?.message });
    return;
  }

  const rank = franked.findIndex((row) => row.id === noticeId);
  if (rank < 0) return;

  const shouldBill = rank >= FORMAL_NOTICES_INCLUDED_PER_MONTH;
  const { error: updateError } = await admin
    .from("formal_notices")
    .update({ billed_to_artisan: shouldBill })
    .eq("id", noticeId);

  if (updateError) {
    console.warn("[recovery] MAJ facturation quota", { noticeId, message: updateError.message });
  }
}

/** Rassemble les pièces justificatives et les expose en URL signées. */
async function collectCaseDocuments(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  context: RecoveryContext,
  artisanId: string,
): Promise<{ ok: true; documents: RubypayeurDocument[] } | { ok: false; error: string }> {
  const documents: RubypayeurDocument[] = [];
  const { invoice } = context;

  const addStoredDocument = async (
    path: string,
    kind: RubypayeurDocument["kind"],
    filename: string,
  ) => {
    const signed = await createRecoveryDocumentSignedUrl(admin, path);
    if (signed.ok) documents.push({ kind, filename, url: signed.data });
  };

  // 1) Facture — pièce obligatoire du dossier.
  const invoiceDoc = await loadFacturXDocumentFromDb(supabase, invoice.id);
  if (!invoiceDoc) return { ok: false, error: "invoice_document_failed" };

  const invoicePath = buildRecoveryDocumentPath({
    artisanId,
    invoiceId: invoice.id,
    kind: "invoice",
  });
  const invoiceUpload = await uploadRecoveryDocument(
    admin,
    invoicePath,
    await renderInvoicePdf(invoiceDoc),
  );
  if (!invoiceUpload.ok) return { ok: false, error: "storage_failed" };
  await addStoredDocument(invoicePath, "invoice", `facture-${invoice.invoiceNumber}.pdf`);

  // 2) Devis signé — renforce la preuve de la commande.
  if (invoice.quoteId) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, signed_at")
      .eq("id", invoice.quoteId)
      .eq("artisan_id", artisanId)
      .maybeSingle();

    if (quote?.signed_at) {
      const quoteDoc = await loadQuotePdfDocument(supabase, quote.id, artisanId);
      if (quoteDoc) {
        const quotePath = buildRecoveryDocumentPath({
          artisanId,
          invoiceId: invoice.id,
          kind: "signed-quote",
        });
        const quoteUpload = await uploadRecoveryDocument(
          admin,
          quotePath,
          await renderQuotePdf(quoteDoc),
        );
        if (quoteUpload.ok) {
          await addStoredDocument(quotePath, "signed_quote", `devis-signe-${quote.id.slice(0, 8)}.pdf`);
        }
      }
    }
  }

  // 3) Historique LRAR — mise en demeure et preuves La Poste.
  const { data: notices } = await supabase
    .from("formal_notices")
    .select("pdf_storage_path, proof_storage_path, filing_proof_storage_path, sent_at")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: false });

  for (const row of notices ?? []) {
    if (row.pdf_storage_path) {
      await addStoredDocument(row.pdf_storage_path, "formal_notice", "mise-en-demeure.pdf");
    }
    if (row.filing_proof_storage_path) {
      await addStoredDocument(row.filing_proof_storage_path, "filing_proof", "preuve-de-depot.pdf");
    }
    if (row.proof_storage_path) {
      await addStoredDocument(row.proof_storage_path, "delivery_proof", "accuse-de-reception.pdf");
    }
  }

  return { ok: true, documents };
}

/**
 * Phase contentieuse — transmet le dossier de créance à RubyPayeur sous mandat
 * de recouvrement amiable/judiciaire, avec rétrocession apporteur d'affaires.
 *
 * `userConsent` matérialise l'acceptation explicite du mandat : sans elle,
 * aucune donnée n'est transmise au prestataire.
 */
export async function submitToRubyPayeurAction(
  invoiceId: string,
  userConsent: boolean,
): Promise<RecoveryActionResult> {
  if (userConsent !== true) return { ok: false, error: "consent_required" };

  const auth = await authenticateArtisan();
  if (!auth.ok) return auth;
  const { supabase, userId, artisanId } = auth.caller;

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return { ok: false, error: "service_unavailable" };

  const loaded = await loadRecoveryContext(supabase, invoiceId, artisanId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { invoice, creditor, debtor } = loaded.context;

  if (invoice.status === "paid") return { ok: false, error: "already_paid" };
  if (invoice.rubypayeurCaseId) return { ok: false, error: "already_submitted" };
  if (invoice.grandTotalCents <= 0) return { ok: false, error: "invalid_amount" };

  const { data: notice } = await supabase
    .from("formal_notices")
    .select("sent_at, status")
    .eq("invoice_id", invoice.id)
    .in("status", ["sent", "in_transit", "waiting_withdrawal", "delivered", "returned", "wrong_address"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Le contentieux suppose une mise en demeure préalable, ou un retard avéré.
  if (!notice && invoice.daysOverdue < COLLECTION_MIN_DAYS_OVERDUE) {
    return { ok: false, error: "formal_notice_required" };
  }

  const collected = await collectCaseDocuments(supabase, admin, loaded.context, artisanId);
  if (!collected.ok) return { ok: false, error: collected.error };

  const mandateAcceptedAt = new Date().toISOString();

  const created = await createRecoveryCase({
    externalReference: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceIssueDate: invoice.issueDate.toISOString(),
    invoiceDueDate: invoice.dueDate?.toISOString() ?? null,
    amountDue: invoice.grandTotalCents / 100,
    creditor: {
      name: creditor.name,
      siren: creditor.siren,
      siret: creditor.siret,
      vatNumber: creditor.vatNumber,
      email: creditor.email,
      phone: creditor.phone,
      addressLine1: creditor.addressLine1,
      postalCode: creditor.postalCode,
      city: creditor.city,
      countryCode: creditor.countryCode,
    },
    debtor: {
      type: debtor.isBusiness ? "company" : "individual",
      name: debtor.name,
      siren: debtor.siren,
      vatNumber: debtor.vatNumber,
      email: debtor.email,
      phone: debtor.phone,
      addressLine1: debtor.addressLine1,
      addressLine2: debtor.addressLine2,
      postalCode: debtor.postalCode,
      city: debtor.city,
      countryCode: debtor.countryCode,
    },
    documents: collected.documents,
    mandateAcceptedAt,
    formalNoticeSentAt: notice?.sent_at ?? null,
  });

  if (!created.ok) {
    console.error("[recovery] création dossier RubyPayeur", { invoiceId, error: created.error });
    if (created.error === "rubypayeur_not_configured") return { ok: false, error: "not_configured" };
    if (created.error.startsWith("missing_") || created.error === "invalid_amount") {
      return { ok: false, error: created.error };
    }
    return { ok: false, error: "submit_failed" };
  }

  const { error: caseError } = await supabase.from("debt_collection_cases").insert({
    invoice_id: invoice.id,
    artisan_id: artisanId,
    user_id: userId,
    rubypayeur_case_id: created.data.caseId,
    amount_total: invoice.grandTotalCents / 100,
    status: created.data.status,
    mandate_accepted_at: mandateAcceptedAt,
  });

  if (caseError) {
    // Le dossier existe chez RubyPayeur : on trace pour réconciliation manuelle.
    console.error("[recovery] persistance dossier", {
      invoiceId,
      caseId: created.data.caseId,
      message: caseError.message,
    });
    return { ok: false, error: "persist_failed" };
  }

  const { error: invoiceError } = await admin
    .from("invoices")
    .update({
      recovery_status: "submitted_to_collection",
      rubypayeur_case_id: created.data.caseId,
    })
    .eq("id", invoice.id);

  if (invoiceError) {
    console.error("[recovery] MAJ facture après transmission", {
      invoiceId,
      message: invoiceError.message,
    });
  }

  revalidateRecoveryPaths(invoice.id);
  return { ok: true };
}
