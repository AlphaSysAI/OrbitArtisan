import type { SupabaseClient } from "@supabase/supabase-js";

import { loadFacturXDocumentFromDb } from "@/lib/billing/facturx/load-from-db";
import { generateFacturX } from "@/lib/billing/facturx/generate-factur-x";
import { renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";
import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";

import { classifyCustomer } from "./classify-customer";
import { buildEReportingPayload, reportingPeriodFromDate } from "./e-reporting";
import type { IPayloadSubmitter, PaSubmissionPayload } from "./payload-submitter";
import {
  frozenInvoicingMessageFor,
  INVOICING_FROZEN_ERROR,
  isDraftInvoicingFrozenForCustomer,
} from "../invoicing-freeze";

const VALID_VAT_RATES = [0, 5.5, 10, 20];

/**
 * Point 4 audit pré-pilote : fenêtre de "claim" anti double-submit. Un
 * finalize() concurrent qui tombe dans cette fenêtre est rejeté ; passé ce
 * délai, un claim resté bloqué (crash serveur, timeout) redevient éligible
 * plutôt que de stranding la facture indéfiniment.
 */
const FINALIZE_CLAIM_STALE_MS = 2 * 60 * 1000;

export type InvoiceEmissionFlow = "e_invoicing" | "e_reporting";

export type FinalizeInvoiceSuccess = {
  ok: true;
  invoiceId: string;
  flow: InvoiceEmissionFlow;
  pdf: Uint8Array;
  pdfFilename: string;
  /** Présent uniquement pour le flux B2B e-invoicing. */
  facturXXml?: string;
  paSubmissionId?: string;
  paSubmissionStatus?: string;
  eReportingQueueId?: string;
};

export type FinalizeInvoiceError = {
  ok: false;
  code:
    | "not_found"
    | "already_finalized"
    | "not_draft"
    | "no_lines"
    | "invalid_vat_rate"
    | "missing_legal_info"
    | "invoicing_frozen"
    | "finalize_in_progress"
    | "number_allocation_failed"
    | "generation_failed"
    | "pa_submission_failed"
    | "persist_failed";
  message: string;
};

export type FinalizeInvoiceResult = FinalizeInvoiceSuccess | FinalizeInvoiceError;

type InvoiceFinalizeRow = {
  id: string;
  artisan_id: string;
  invoice_number: string | null;
  status: string;
  finalized_at: string | null;
};

export class InvoiceService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly payloadSubmitter: IPayloadSubmitter,
  ) {}

  /**
   * Finalise une facture brouillon et route l'émission :
   * - B2B (SIREN + TVA valides) → Factur-X + soumission PA
   * - B2C → PDF simple + file e-reporting
   */
  async finalize(invoiceId: string, artisanId: string): Promise<FinalizeInvoiceResult> {
    const invoice = await this.loadInvoiceForFinalize(invoiceId, artisanId);
    if (!invoice) {
      return { ok: false, code: "not_found", message: "Facture introuvable." };
    }

    if (invoice.finalized_at) {
      return { ok: false, code: "already_finalized", message: "Cette facture est déjà finalisée." };
    }

    if (invoice.status !== "draft") {
      return { ok: false, code: "not_draft", message: "Seules les factures brouillon peuvent être finalisées." };
    }

    // Point 4 audit pré-pilote : claim atomique anti double-submit — un clic
    // en double (ou une requête rejouée) pendant la génération PDF/Factur-X/
    // soumission PA ne doit jamais déclencher deux émissions de la même
    // facture. Le claim est libéré explicitement à chaque échec ci-dessous
    // pour ne pas bloquer un nouvel essai pendant 2 minutes sur une simple
    // erreur transitoire.
    const staleThreshold = new Date(Date.now() - FINALIZE_CLAIM_STALE_MS).toISOString();
    const { data: claimed, error: claimError } = await this.supabase
      .from("invoices")
      .update({ finalizing_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .eq("status", "draft")
      .is("finalized_at", null)
      .or(`finalizing_at.is.null,finalizing_at.lt.${staleThreshold}`)
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      return {
        ok: false,
        code: "finalize_in_progress",
        message: "Une finalisation est déjà en cours pour cette facture — réessaie dans un instant.",
      };
    }

    const document = await loadFacturXDocumentFromDb(this.supabase, invoiceId);
    if (!document) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return { ok: false, code: "not_found", message: "Impossible de charger les données de la facture." };
    }

    // Vague 7 (garde-fou) : le gel ne bloque plus la création de brouillon
    // que pour le B2B (voir invoicing-freeze.ts). Rien n'empêche
    // structurellement qu'un brouillon B2B existe déjà malgré ça (import,
    // changement de client après coup, futur point d'entrée non gardé) —
    // on revalide donc ici, avant tout autre contrôle et avant d'allouer un
    // numéro de facture, pour ne jamais gaspiller un numéro séquentiel sur
    // une finalisation qui doit de toute façon échouer.
    const customerClass = classifyCustomer({
      siren: document.buyer.siren,
      siret: document.buyer.siret,
      vatNumber: document.buyer.vatNumber,
    });
    if (isDraftInvoicingFrozenForCustomer(customerClass)) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: INVOICING_FROZEN_ERROR,
        message: frozenInvoicingMessageFor(customerClass),
      };
    }

    if (document.lines.length === 0) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return { ok: false, code: "no_lines", message: "La facture ne contient aucune ligne." };
    }

    // Point 3 audit pré-pilote : un taux de TVA hors [0, 5.5, 10, 20] signale
    // une donnée corrompue ou un taux réduit non éligible mal renseigné — on
    // bloque la finalisation plutôt que d'émettre un document légal erroné.
    const invalidRateLine = document.lines.find((line) => !VALID_VAT_RATES.includes(line.vatRate));
    if (invalidRateLine) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "invalid_vat_rate",
        message: `Taux de TVA invalide (${invalidRateLine.vatRate} %) sur la ligne "${invalidRateLine.label}".`,
      };
    }

    // Importants facturation (Vague 2) : contrôle bloquant si les mentions
    // légales obligatoires de l'artisan (SIRET, adresse, assurance
    // décennale) manquent au profil — jamais laisser partir une facture
    // (ou un Factur-X soumis à la PA) sans ces informations réglementaires.
    const missingLegalFields: string[] = [];
    if (!document.seller.siret) missingLegalFields.push("SIRET");
    if (!document.seller.addressLine1 || !document.seller.postalCode || !document.seller.city) {
      missingLegalFields.push("adresse");
    }
    if (!document.legalMentions?.some((line) => line.startsWith("Assurance décennale"))) {
      missingLegalFields.push("assurance décennale");
    }
    if (missingLegalFields.length > 0) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "missing_legal_info",
        message: `Informations obligatoires manquantes sur ton profil avant de facturer : ${missingLegalFields.join(", ")}. Complète-les dans Réglages > Mon activité.`,
      };
    }

    // Point 4 audit pré-pilote : le numéro définitif n'est attribué qu'ici,
    // une fois tous les contrôles bloquants passés — jamais à la création
    // du brouillon. Compteur séquentiel et gapless par (artisan, type,
    // année), alloué atomiquement côté base (voir allocate_invoice_number).
    const { data: allocatedNumber, error: numberError } = await this.supabase.rpc("allocate_invoice_number", {
      p_invoice_id: invoiceId,
    });
    if (numberError || typeof allocatedNumber !== "string" || !allocatedNumber) {
      console.error("[InvoiceService] invoice number allocation failed", numberError);
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "number_allocation_failed",
        message: "Impossible d'attribuer un numéro de facture.",
      };
    }
    document.invoiceNumber = allocatedNumber;

    if (customerClass === "b2b") {
      return this.finalizeB2B(invoiceId, artisanId, document);
    }

    return this.finalizeB2C(invoiceId, artisanId, document);
  }

  /**
   * Libère le claim de finalisation posé ci-dessus, pour permettre un
   * nouvel essai immédiat après une erreur transitoire (génération,
   * soumission PA, écriture DB) plutôt que d'attendre l'expiration de la
   * fenêtre anti double-submit.
   */
  private async releaseFinalizeClaim(invoiceId: string, artisanId: string): Promise<void> {
    await this.supabase
      .from("invoices")
      .update({ finalizing_at: null })
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .is("finalized_at", null);
  }

  private async loadInvoiceForFinalize(invoiceId: string, artisanId: string): Promise<InvoiceFinalizeRow | null> {
    const { data, error } = await this.supabase
      .from("invoices")
      .select("id, artisan_id, invoice_number, status, finalized_at")
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .maybeSingle();

    if (error || !data) return null;
    return data as InvoiceFinalizeRow;
  }

  private async finalizeB2B(
    invoiceId: string,
    artisanId: string,
    document: FacturXInvoiceDocument,
  ): Promise<FinalizeInvoiceResult> {
    let facturX;
    try {
      facturX = await generateFacturX(document, { profile: "en16931" });
    } catch (error) {
      console.error("[InvoiceService] Factur-X generation failed", error);
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "generation_failed",
        message: "Échec de la génération Factur-X.",
      };
    }

    const paPayload: PaSubmissionPayload = {
      invoiceId,
      invoiceNumber: document.invoiceNumber,
      facturXPdf: facturX.pdf,
      facturXXml: facturX.xml,
      seller: {
        name: document.seller.name,
        siren: document.seller.siren ?? null,
        siret: document.seller.siret ?? null,
        vatNumber: document.seller.vatNumber ?? null,
      },
      buyer: {
        name: document.buyer.name,
        siren: document.buyer.siren ?? null,
        siret: document.buyer.siret ?? null,
        vatNumber: document.buyer.vatNumber ?? null,
      },
    };

    let paResult;
    try {
      paResult = await this.payloadSubmitter.submitEInvoice(paPayload);
    } catch (error) {
      console.error("[InvoiceService] PA submission failed", error);
      // Le numéro alloué (document.invoiceNumber) reste "consommé" côté
      // compteur même après cette libération — un nouvel essai en tirera un
      // nouveau. L'écart résultant est documenté et légalement toléré
      // (BOI-TVA-DECLA-30-20-20) pour un échec technique non systématique ;
      // à surveiller si les échecs PA deviennent fréquents en usage réel.
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "pa_submission_failed",
        message: "Échec de la soumission à la Plateforme Agréée.",
      };
    }

    const now = new Date().toISOString();
    const dueDate = await this.computeDueDate(artisanId);

    const { error: updateError } = await this.supabase
      .from("invoices")
      .update({
        status: "sent",
        finalized_at: now,
        finalizing_at: null,
        invoice_number: document.invoiceNumber,
        due_date: dueDate,
        emission_flow: "e_invoicing",
        e_invoicing_status: "DEPOSITED",
        pa_submission_id: paResult.submissionId,
        pa_submission_status: paResult.status,
      })
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .is("finalized_at", null);

    if (updateError) {
      // La soumission PA a déjà eu lieu à ce stade sous document.invoiceNumber.
      // Ne PAS libérer le claim ici : rejouer finalize() réémettrait un
      // second Factur-X sous un numéro différent pour la même soumission PA
      // déjà acceptée. Nécessite une reprise manuelle (voir logs).
      console.error("[InvoiceService] persist failed after PA submission — manual reconciliation required", {
        invoiceId,
        invoiceNumber: document.invoiceNumber,
        paSubmissionId: paResult.submissionId,
      });
      return { ok: false, code: "persist_failed", message: "Impossible d'enregistrer la finalisation." };
    }

    return {
      ok: true,
      invoiceId,
      flow: "e_invoicing",
      pdf: facturX.pdf,
      pdfFilename: pdfFilename(document.invoiceNumber, "factur-x", document.invoiceType),
      facturXXml: facturX.xml,
      paSubmissionId: paResult.submissionId,
      paSubmissionStatus: paResult.status,
    };
  }

  private async finalizeB2C(
    invoiceId: string,
    artisanId: string,
    document: FacturXInvoiceDocument,
  ): Promise<FinalizeInvoiceResult> {
    let pdf: Uint8Array;
    try {
      pdf = await renderInvoicePdf(document);
    } catch (error) {
      console.error("[InvoiceService] PDF generation failed", error);
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return { ok: false, code: "generation_failed", message: "Échec de la génération du PDF." };
    }

    const payload = buildEReportingPayload(document, invoiceId);
    const reportingPeriod = reportingPeriodFromDate(document.issueDate);

    const { data: queueRow, error: queueError } = await this.supabase
      .from("e_reporting_queue")
      .insert({
        invoice_id: invoiceId,
        artisan_id: artisanId,
        status: "pending",
        payload,
        reporting_period: reportingPeriod,
      })
      .select("id")
      .single();

    if (queueError || !queueRow?.id) {
      await this.releaseFinalizeClaim(invoiceId, artisanId);
      return {
        ok: false,
        code: "persist_failed",
        message: "Impossible d'enregistrer la file e-reporting.",
      };
    }

    const now = new Date().toISOString();
    const dueDate = await this.computeDueDate(artisanId);

    const { error: updateError } = await this.supabase
      .from("invoices")
      .update({
        status: "sent",
        finalized_at: now,
        finalizing_at: null,
        invoice_number: document.invoiceNumber,
        due_date: dueDate,
        emission_flow: "e_reporting",
      })
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .is("finalized_at", null);

    if (updateError) {
      // La file e-reporting a déjà été alimentée sous document.invoiceNumber
      // à ce stade. Ne pas libérer le claim pour éviter une seconde entrée
      // de file sous un autre numéro pour la même facture — reprise après
      // expiration de la fenêtre anti double-submit (voir logs).
      console.error("[InvoiceService] persist failed after e-reporting queue insert — manual reconciliation required", {
        invoiceId,
        invoiceNumber: document.invoiceNumber,
        eReportingQueueId: queueRow.id,
      });
      return { ok: false, code: "persist_failed", message: "Impossible d'enregistrer la finalisation." };
    }

    return {
      ok: true,
      invoiceId,
      flow: "e_reporting",
      pdf,
      pdfFilename: pdfFilename(document.invoiceNumber, "pdf", document.invoiceType),
      eReportingQueueId: queueRow.id as string,
    };
  }

  private async computeDueDate(artisanId: string): Promise<string> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("default_payment_terms_days")
      .eq("id", artisanId)
      .maybeSingle();

    const days = profile?.default_payment_terms_days ?? 30;
    const due = new Date();
    due.setDate(due.getDate() + days);
    return due.toISOString().slice(0, 10);
  }
}

function pdfFilename(invoiceNumber: string, suffix: string, invoiceType?: string): string {
  const safe = invoiceNumber.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
  const base = invoiceType === "credit_note" ? "avoir" : "facture";
  return `${base}-${safe}.${suffix === "factur-x" ? "pdf" : suffix}`;
}
