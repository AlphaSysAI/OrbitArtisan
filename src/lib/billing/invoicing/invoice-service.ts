import type { SupabaseClient } from "@supabase/supabase-js";

import { loadFacturXDocumentFromDb } from "@/lib/billing/facturx/load-from-db";
import { generateFacturX } from "@/lib/billing/facturx/generate-factur-x";
import { renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";
import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";

import { classifyCustomer } from "./classify-customer";
import { buildEReportingPayload, reportingPeriodFromDate } from "./e-reporting";
import type { IPayloadSubmitter, PaSubmissionPayload } from "./payload-submitter";

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

    const document = await loadFacturXDocumentFromDb(this.supabase, invoiceId);
    if (!document) {
      return { ok: false, code: "not_found", message: "Impossible de charger les données de la facture." };
    }

    if (document.lines.length === 0) {
      return { ok: false, code: "no_lines", message: "La facture ne contient aucune ligne." };
    }

    const customerClass = classifyCustomer({
      siren: document.buyer.siren,
      siret: document.buyer.siret,
      vatNumber: document.buyer.vatNumber,
    });

    if (customerClass === "b2b") {
      return this.finalizeB2B(invoiceId, artisanId, document);
    }

    return this.finalizeB2C(invoiceId, artisanId, document);
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
      return { ok: false, code: "persist_failed", message: "Impossible d'enregistrer la finalisation." };
    }

    return {
      ok: true,
      invoiceId,
      flow: "e_invoicing",
      pdf: facturX.pdf,
      pdfFilename: pdfFilename(document.invoiceNumber, "factur-x"),
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
        due_date: dueDate,
        emission_flow: "e_reporting",
      })
      .eq("id", invoiceId)
      .eq("artisan_id", artisanId)
      .is("finalized_at", null);

    if (updateError) {
      return { ok: false, code: "persist_failed", message: "Impossible d'enregistrer la finalisation." };
    }

    return {
      ok: true,
      invoiceId,
      flow: "e_reporting",
      pdf,
      pdfFilename: pdfFilename(document.invoiceNumber, "pdf"),
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

function pdfFilename(invoiceNumber: string, suffix: string): string {
  const safe = invoiceNumber.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
  return `facture-${safe}.${suffix === "factur-x" ? "pdf" : suffix}`;
}
