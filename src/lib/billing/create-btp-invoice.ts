import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { allocateInvoiceCents } from "@/lib/billing/invoice-amounts";
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
    .select("grand_total, invoice_type, finalized_at")
    .eq("quote_id", quoteId);

  if (error) throw new Error("invoice_total_read_failed");

  return (data ?? []).reduce((acc, row) => {
    if (row.invoice_type === "credit_note") return acc - (row.finalized_at ? row.grand_total ?? 0 : 0);
    return acc + (row.grand_total ?? 0);
  }, 0);
}

export type InvoiceDraftLine = {
  line_kind: "labor" | "service" | "material";
  label: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  vat_rate: number;
  vat_category_code: string;
  vat_exemption_reason: string | null;
  unit?: string | null;
};

export async function insertInvoiceDraft(
  db: SupabaseClient, header: Record<string, unknown>, lines: InvoiceDraftLine[], expectedInvoiced: number,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { data, error } = await db.rpc("save_invoice_draft", {
    p_header: header,
    p_lines: lines.map((line, sort_order) => ({ ...line, sort_order })),
    p_expected_invoiced: expectedInvoiced,
  });
  if (error || typeof data !== "string") return { ok: false, error: "insert_failed" };
  return { ok: true, invoiceId: data };
}

export async function createTypedInvoiceFromQuote(
  supabase: SupabaseClient,
  profileId: string,
  quote: QuoteRow,
  options: {
    invoiceType: InvoiceType;
    amountCents: number;
    expectedInvoiced?: number;
    retentionSourceId?: string;
    progressPercentage?: number;
    label: string;
    notes?: string | null;
  },
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (quote.status !== "accepted") return { ok: false, error: "quote_not_accepted" };
  if (options.amountCents <= 0) return { ok: false, error: "zero_amount" };

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quote.id).catch(() => null);
  if (alreadyInvoiced === null) return { ok: false, error: "invoice_total_read_failed" };
  if (options.expectedInvoiced !== undefined && alreadyInvoiced !== options.expectedInvoiced) {
    return { ok: false, error: "invoice_total_changed" };
  }
  const remaining = computeRemainingBillableCents(quote.grand_total, alreadyInvoiced);
  if (options.amountCents > remaining) return { ok: false, error: "exceeds_remaining" };

  const { data: materials, error } = await supabase.from("quote_materials")
    .select("line_total, vat_rate").eq("quote_id", quote.id).eq("exclude_from_invoice", false);
  if (error) return { ok: false, error: "quote_lines_unavailable" };
  const materialTotal = (materials ?? []).reduce((sum, line) => sum + line.line_total, 0);
  const labor = quote.grand_total - materialTotal;
  if (labor < 0) return { ok: false, error: "inconsistent_quote_total" };

  const byRate = new Map<number, number>();
  const add = (rate: number, amount: number) => {
    if (amount > 0) byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  };
  add(vatFieldsForRate(quote.reduced_vat_rate).vat_rate, labor);
  for (const line of materials ?? []) add(vatFieldsForRate(line.vat_rate).vat_rate, line.line_total);
  const rates = [...byRate.keys()];
  const amounts = allocateInvoiceCents(options.amountCents, [...byRate.values()]);
  const lines: InvoiceDraftLine[] = rates.flatMap((rate, index) => {
    const amount = amounts[index];
    return amount > 0 ? [{
      line_kind: "service",
      label: options.label,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
      ...vatFieldsForRate(rate),
    }] : [];
  });
  return insertInvoiceDraft(supabase, {
    artisan_id: profileId,
    quote_id: quote.id,
    customer_user_id: quote.customer_user_id,
    customer_name: quote.customer_name,
    customer_email: quote.customer_email,
    invoice_type: options.invoiceType,
    parent_invoice_id: options.retentionSourceId ?? null,
    progress_percentage: options.progressPercentage ?? null,
    quote_reference_total: quote.grand_total,
    labor_total: 0,
    materials_total: 0,
    grand_total: options.amountCents,
    notes: options.notes ?? quote.notes,
    ...DEFAULT_INVOICE_EINVOICING,
  }, lines, alreadyInvoiced);
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
