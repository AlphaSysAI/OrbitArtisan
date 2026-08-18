import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_INVOICE_EINVOICING, DEFAULT_INVOICE_LINE_VAT } from "@/lib/billing/einvoicing-types";
import {
  computeDepositAmountCents,
  computeProgressInvoiceAmountCents,
  computeRemainingBillableCents,
  invoiceNumberPrefix,
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
};

export async function sumInvoicedOnQuote(supabase: SupabaseClient, quoteId: string): Promise<number> {
  const { data } = await supabase
    .from("invoices")
    .select("grand_total, invoice_type")
    .eq("quote_id", quoteId);

  return (data ?? [])
    .filter((row) => row.invoice_type !== "credit_note")
    .reduce((acc, row) => acc + (row.grand_total ?? 0), 0);
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

  const prefix = invoiceNumberPrefix(options.invoiceType);
  const invoiceNumber = `${prefix}-${quote.id.replace(/-/g, "").slice(0, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      artisan_id: profileId,
      quote_id: quote.id,
      customer_user_id: quote.customer_user_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      invoice_number: invoiceNumber,
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
    ...DEFAULT_INVOICE_LINE_VAT,
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
