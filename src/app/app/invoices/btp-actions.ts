"use server";

import { revalidatePath } from "next/cache";

import {
  createTypedInvoiceFromQuote,
  sumInvoicedOnQuote,
} from "@/lib/billing/create-btp-invoice";
import { DEFAULT_INVOICE_EINVOICING, DEFAULT_INVOICE_LINE_VAT } from "@/lib/billing/einvoicing-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createCreditNoteFromInvoice(
  invoiceId: string,
): Promise<{ ok: true; creditNoteId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "profile" };

  const { data: source } = await supabase
    .from("invoices")
    .select("id, artisan_id, quote_id, customer_user_id, customer_name, customer_email, grand_total, invoice_number, status, invoice_type")
    .eq("id", invoiceId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!source) return { ok: false, error: "not_found" };
  if (source.invoice_type === "credit_note") return { ok: false, error: "is_credit_note" };
  if (source.status !== "paid" && source.status !== "sent" && source.status !== "overdue") {
    return { ok: false, error: "invalid_status" };
  }

  const amount = source.grand_total ?? 0;
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const invoiceNumber = `AV-${source.invoice_number ?? source.id.slice(0, 8).toUpperCase()}`;

  const { data: creditNote, error: invErr } = await supabase
    .from("invoices")
    .insert({
      artisan_id: profile.id,
      quote_id: source.quote_id,
      customer_user_id: source.customer_user_id,
      customer_name: source.customer_name,
      customer_email: source.customer_email,
      invoice_number: invoiceNumber,
      status: "draft",
      invoice_type: "credit_note",
      credit_note_for_invoice_id: source.id,
      parent_invoice_id: source.id,
      labor_total: 0,
      materials_total: 0,
      grand_total: amount,
      notes: `Avoir sur facture ${source.invoice_number ?? source.id.slice(0, 8)}`,
      ...DEFAULT_INVOICE_EINVOICING,
    })
    .select("id")
    .single();

  if (invErr || !creditNote?.id) return { ok: false, error: "insert_failed" };

  await supabase.from("invoice_lines").insert({
    invoice_id: creditNote.id,
    line_kind: "service",
    label: `Avoir — ${source.invoice_number ?? "facture"}`,
    quantity: 1,
    unit_price: amount,
    line_total: amount,
    sort_order: 0,
    ...DEFAULT_INVOICE_LINE_VAT,
  });

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true, creditNoteId: creditNote.id };
}

export async function releaseRetention(invoiceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "profile" };

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, artisan_id, retention_amount, retention_released_at, quote_id, customer_user_id, customer_name, customer_email, invoice_number")
    .eq("id", invoiceId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!inv) return { ok: false, error: "not_found" };
  if (!inv.retention_amount || inv.retention_amount <= 0) return { ok: false, error: "no_retention" };
  if (inv.retention_released_at) return { ok: false, error: "already_released" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, artisan_id, status, customer_user_id, customer_name, customer_email, grand_total, notes")
    .eq("id", inv.quote_id)
    .maybeSingle();

  if (!quote || quote.status !== "accepted") return { ok: false, error: "quote_not_accepted" };

  const result = await createTypedInvoiceFromQuote(supabase, profile.id, quote, {
      invoiceType: "final",
      amountCents: inv.retention_amount,
      label: `Libération retenue de garantie — ${inv.invoice_number ?? ""}`,
      notes: "Facture de libération de la retenue de garantie (5 %).",
    },
  );

  if (!result.ok) return result;

  await supabase.from("invoices").update({ retention_released_at: new Date().toISOString() }).eq("id", invoiceId);

  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath(`/app/invoices/${result.invoiceId}`);
  return { ok: true };
}

export async function duplicateQuote(quoteId: string): Promise<{ ok: true; newQuoteId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "profile" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!quote) return { ok: false, error: "not_found" };

  const { data: newQuote, error } = await supabase
    .from("quotes")
    .insert({
      artisan_id: profile.id,
      customer_user_id: quote.customer_user_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      status: "draft",
      labor_rate_per_hour: quote.labor_rate_per_hour,
      labor_duration_minutes: quote.labor_duration_minutes,
      labor_total: quote.labor_total,
      materials_total: quote.materials_total,
      grand_total: quote.grand_total,
      notes: quote.notes,
      reduced_vat_rate: quote.reduced_vat_rate,
      generate_vat_attestation: quote.generate_vat_attestation,
      work_site_address: quote.work_site_address,
      work_site_city: quote.work_site_city,
      work_site_postal_code: quote.work_site_postal_code,
    })
    .select("id")
    .single();

  if (error || !newQuote?.id) return { ok: false, error: "insert_failed" };

  const [{ data: services }, { data: materials }] = await Promise.all([
    supabase.from("quote_services").select("*").eq("quote_id", quoteId),
    supabase.from("quote_materials").select("*").eq("quote_id", quoteId),
  ]);

  if (services?.length) {
    await supabase.from("quote_services").insert(
      services.map((s) => ({
        quote_id: newQuote.id,
        service_id: s.service_id,
        service_title: s.service_title,
        duration_minutes: s.duration_minutes,
        unit_price: s.unit_price,
        line_total: s.line_total,
      })),
    );
  }

  if (materials?.length) {
    await supabase.from("quote_materials").insert(
      materials.map((m) => ({
        quote_id: newQuote.id,
        label: m.label,
        quantity: m.quantity,
        unit_price: m.unit_price,
        line_total: m.line_total,
        vat_rate: m.vat_rate,
      })),
    );
  }

  revalidatePath("/app/quotes");
  return { ok: true, newQuoteId: newQuote.id };
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
