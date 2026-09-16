import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/admin/db";
import { DEFAULT_INVOICE_EINVOICING, vatFieldsForRate } from "@/lib/billing/einvoicing-types";
import {
  computeDepositAmountCents,
  computeProgressInvoiceAmountCents,
  computeRemainingBillableCents,
  type InvoiceType,
} from "@/lib/billing/invoice-types";

type QuoteRow = {
  id: string;
  artisan_id: string;
  status: string;
  customer_user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  grand_total: number;
  notes: string | null;
  /** Point 3 audit pré-pilote : à propager sur la ligne de facture. */
  reduced_vat_rate?: number | null;
};

export async function sumInvoicedOnQuote(supabase: SupabaseClient, quoteId: string): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .select("grand_total, invoice_type")
    .eq("quote_id", quoteId);

  if (error && isMissingColumnError(error)) {
    const { data: fallback } = await supabase.from("invoices").select("grand_total").eq("quote_id", quoteId);
    return (fallback ?? []).reduce((acc, row) => acc + (row.grand_total ?? 0), 0);
  }

  // Importants facturation (Vague 2) : un avoir doit RÉDUIRE le montant déjà
  // facturé sur le devis (déjà-facturé net), pas en être exclu — sinon un
  // acompte annulé par avoir reste compté comme "déjà facturé" et bloque
  // à tort la facturation du solde restant.
  return (data ?? []).reduce((acc, row) => {
    if (row.invoice_type === "credit_note") return acc - (row.grand_total ?? 0);
    return acc + (row.grand_total ?? 0);
  }, 0);
}

export async function createTypedInvoiceFromQuote(
  supabase: SupabaseClient,
  profileId: string,
  quote: QuoteRow,
  options: {
    invoiceType: InvoiceType;
    amountCents: number;
    progressPercentage?: number;
    label: string;
    notes?: string | null;
  },
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (quote.status !== "accepted") return { ok: false, error: "quote_not_accepted" };
  if (options.amountCents <= 0) return { ok: false, error: "zero_amount" };

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quote.id);
  const remaining = computeRemainingBillableCents(quote.grand_total, alreadyInvoiced);
  if (options.amountCents > remaining) return { ok: false, error: "exceeds_remaining" };

  // Point 4 audit pré-pilote : le numéro n'est plus généré ici. Un vrai
  // numéro séquentiel (par artisan/type/année) est attribué à la
  // finalisation via allocate_invoice_number() — voir InvoiceService.finalize.
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      artisan_id: profileId,
      quote_id: quote.id,
      customer_user_id: quote.customer_user_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      invoice_number: null,
      status: "draft",
      invoice_type: options.invoiceType,
      progress_percentage: options.progressPercentage ?? null,
      quote_reference_total: quote.grand_total,
      labor_total: 0,
      materials_total: 0,
      grand_total: options.amountCents,
      notes: options.notes ?? quote.notes,
      ...DEFAULT_INVOICE_EINVOICING,
    })
    .select("id")
    .single();

  if (invErr || !invoice?.id) return { ok: false, error: "insert_failed" };

  const { error: lineErr } = await supabase.from("invoice_lines").insert({
    invoice_id: invoice.id,
    line_kind: "service",
    label: options.label,
    quantity: 1,
    unit_price: options.amountCents,
    line_total: options.amountCents,
    sort_order: 0,
    ...vatFieldsForRate(quote.reduced_vat_rate),
  });

  if (lineErr) return { ok: false, error: "lines_failed" };

  return { ok: true, invoiceId: invoice.id };
}

export function computeDepositForQuote(quoteGrandTotal: number, percent: number, alreadyInvoiced: number) {
  const amount = computeDepositAmountCents(quoteGrandTotal, percent);
  const remaining = computeRemainingBillableCents(quoteGrandTotal, alreadyInvoiced);
  return Math.min(amount, remaining);
}

export function computeProgressForQuote(
  quoteGrandTotal: number,
  cumulativePercent: number,
  alreadyInvoiced: number,
) {
  return computeProgressInvoiceAmountCents(quoteGrandTotal, cumulativePercent, alreadyInvoiced);
}
