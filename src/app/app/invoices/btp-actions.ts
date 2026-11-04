"use server";

import { revalidatePath } from "next/cache";

import {
  createTypedInvoiceFromQuote,
  insertInvoiceDraft,
} from "@/lib/billing/create-btp-invoice";
import { DEFAULT_INVOICE_EINVOICING } from "@/lib/billing/einvoicing-types";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { redirect } from "next/navigation";
import { frozenInvoicingResult, isDraftInvoicingFrozenForCustomer } from "@/lib/billing/invoicing-freeze";
import { resolveCustomerClassification } from "@/lib/billing/invoicing/resolve-customer-classification";

async function createCreditNoteFromInvoice(
  invoiceId: string,
): Promise<{ ok: true; creditNoteId: string } | { ok: false; error: string }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "profile" };
  const { supabase, profileId } = auth;

  const { data: source } = await supabase
    .from("invoices")
    .select("id, artisan_id, quote_id, customer_user_id, customer_name, customer_email, grand_total, invoice_number, status, invoice_type")
    .eq("id", invoiceId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!source) return { ok: false, error: "not_found" };
  if (source.invoice_type === "credit_note") return { ok: false, error: "is_credit_note" };
  if (source.status !== "paid" && source.status !== "sent" && source.status !== "overdue") {
    return { ok: false, error: "invalid_status" };
  }

  // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts).
  const customerClass = await resolveCustomerClassification(supabase, source.customer_user_id);
  if (isDraftInvoicingFrozenForCustomer(customerClass)) return frozenInvoicingResult();

  const amount = source.grand_total ?? 0;
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const result = await insertInvoiceDraft(supabase, {
    artisan_id: profileId,
    quote_id: source.quote_id,
    customer_user_id: source.customer_user_id,
    customer_name: source.customer_name,
    customer_email: source.customer_email,
    invoice_type: "credit_note",
    credit_note_for_invoice_id: source.id,
    parent_invoice_id: source.id,
    labor_total: 0,
    materials_total: 0,
    grand_total: amount,
    notes: `Avoir sur facture ${source.invoice_number ?? source.id.slice(0, 8)}`,
    ...DEFAULT_INVOICE_EINVOICING,
  }, [], 0);
  if (!result.ok) return result;

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true, creditNoteId: result.invoiceId };
}

async function releaseRetention(invoiceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "profile" };
  const { supabase, profileId } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, artisan_id, retention_amount, retention_released_at, quote_id, customer_user_id, customer_name, customer_email, invoice_number")
    .eq("id", invoiceId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!inv) return { ok: false, error: "not_found" };
  if (!inv.retention_amount || inv.retention_amount <= 0) return { ok: false, error: "no_retention" };
  if (inv.retention_released_at) return { ok: false, error: "already_released" };

  // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts).
  const customerClass = await resolveCustomerClassification(supabase, inv.customer_user_id);
  if (isDraftInvoicingFrozenForCustomer(customerClass)) return frozenInvoicingResult();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, artisan_id, status, customer_user_id, customer_name, customer_email, grand_total, notes, reduced_vat_rate")
    .eq("id", inv.quote_id)
    .maybeSingle();

  if (!quote || quote.status !== "accepted") return { ok: false, error: "quote_not_accepted" };

  const result = await createTypedInvoiceFromQuote(supabase, profileId, quote, {
      invoiceType: "final",
      amountCents: inv.retention_amount,
      retentionSourceId: inv.id,
      label: `Libération retenue de garantie — ${inv.invoice_number ?? ""}`,
      notes: "Facture de libération de la retenue de garantie.",
    },
  );

  if (!result.ok) return result;

  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath(`/app/invoices/${result.invoiceId}`);
  return { ok: true };
}

export async function duplicateQuote(quoteId: string): Promise<{ ok: true; newQuoteId: string } | { ok: false; error: string }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "profile" };
  const { supabase, profileId } = auth;

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!quote) return { ok: false, error: "not_found" };

  const [services, materials] = await Promise.all([
    supabase.from("quote_services").select("service_id, service_title, duration_minutes, unit_price").eq("quote_id", quoteId),
    supabase.from("quote_materials")
      .select("label, quantity, unit_price, line_total, vat_rate, unit, exclude_from_invoice, supplier_product_id, supplier_url, supplier_sku, is_supplier_catalog")
      .eq("quote_id", quoteId),
  ]);
  if (services.error || materials.error) return { ok: false, error: "read_failed" };
  // Reprend les propriétés économiques. La migration 67 ignore l'état et les
  // données de signature du devis source et crée un nouveau brouillon.
  const { data: newQuoteId, error } = await supabase.rpc("save_quote_document", {
    p_quote_id: null,
    p_header: {
      ...quote,
      // L'acceptation anticipée est propre à chaque document.
      retraction_waived: false,
    },
    p_services: services.data ?? [],
    p_materials: materials.data ?? [],
    p_send: false,
  });
  if (error || typeof newQuoteId !== "string") return { ok: false, error: "insert_failed" };

  revalidatePath("/app/quotes");
  return { ok: true, newQuoteId };
}

export async function createCreditNoteForm(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/app/invoices");
  const res = await createCreditNoteFromInvoice(invoiceId);
  if (!res.ok) redirect(`/app/invoices/${invoiceId}?error=credit_note`);
  redirect(`/app/invoices/${res.creditNoteId}`);
}

export async function releaseRetentionForm(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/app/invoices");
  const res = await releaseRetention(invoiceId);
  if (!res.ok) redirect(`/app/invoices/${invoiceId}?error=retention`);
  redirect(`/app/invoices/${invoiceId}?retention_released=1`);
}
