"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

export async function createInvoiceFromQuoteForm(formData: FormData): Promise<void> {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  if (!quoteId) redirect("/app/invoices?error=missing");
  await createInvoiceFromQuote(quoteId);
}

export async function createInvoiceFromQuote(quoteId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/login");

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, artisan_id, status, customer_user_id, customer_name, customer_email, labor_total, materials_total, grand_total, labor_duration_minutes, notes",
    )
    .eq("id", quoteId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!quote || quote.status !== "accepted") {
    redirect(`/app/quotes/${quoteId}?error=invoice`);
  }

  const { data: existing } = await supabase.from("invoices").select("id").eq("quote_id", quoteId).maybeSingle();
  if (existing?.id) redirect(`/app/invoices/${existing.id}`);

  const invoiceNumber = `INV-${quoteId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      artisan_id: profile.id,
      quote_id: quoteId,
      customer_user_id: quote.customer_user_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      invoice_number: invoiceNumber,
      status: "draft",
      labor_total: quote.labor_total,
      materials_total: quote.materials_total,
      grand_total: quote.grand_total,
      notes: quote.notes,
    })
    .select("id")
    .single();

  if (invErr || !invoice?.id) redirect(`/app/quotes/${quoteId}?error=invoice_insert`);

  const lines: {
    invoice_id: string;
    line_kind: "labor" | "service" | "material";
    label: string;
    quantity: number | null;
    unit_price: number | null;
    line_total: number;
    sort_order: number;
  }[] = [];

  let sort = 0;
  lines.push({
    invoice_id: invoice.id,
    line_kind: "labor",
    label: `Main d'œuvre (${quote.labor_duration_minutes} min)`,
    quantity: 1,
    unit_price: quote.labor_total,
    line_total: quote.labor_total,
    sort_order: sort++,
  });

  const { data: qServices } = await supabase
    .from("quote_services")
    .select("service_title, duration_minutes, unit_price, line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  for (const s of qServices ?? []) {
    const lt = s.line_total ?? s.unit_price ?? 0;
    lines.push({
      invoice_id: invoice.id,
      line_kind: "service",
      label: `${s.service_title} (${s.duration_minutes} min)`,
      quantity: 1,
      unit_price: s.unit_price,
      line_total: lt,
      sort_order: sort++,
    });
  }

  const { data: qMaterials } = await supabase
    .from("quote_materials")
    .select("label, quantity, unit_price, line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  for (const m of qMaterials ?? []) {
    lines.push({
      invoice_id: invoice.id,
      line_kind: "material",
      label: m.label,
      quantity: m.quantity,
      unit_price: m.unit_price,
      line_total: m.line_total,
      sort_order: sort++,
    });
  }

  const { error: linesErr } = await supabase.from("invoice_lines").insert(lines);
  if (linesErr) redirect(`/app/quotes/${quoteId}?error=invoice_lines`);

  revalidatePath("/app/invoices");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/quotes");
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoice.id}`);
  redirect(`/app/invoices/${invoice.id}`);
}

export async function updateInvoice(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "draft").trim();

  if (!invoiceId) redirect("/app/invoices");
  if (!["draft", "sent", "paid"].includes(status)) redirect(`/app/invoices/${invoiceId}?error=status`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/login");

  const { data: inv } = await supabase.from("invoices").select("id, artisan_id").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.artisan_id !== profile.id) redirect("/app/invoices");

  const { error } = await supabase
    .from("invoices")
    .update({
      invoice_number: invoiceNumber || null,
      notes: notes || null,
      status,
    })
    .eq("id", invoiceId);

  if (error) redirect(`/app/invoices/${invoiceId}?error=update`);

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);
}

export async function startStripeExpressOnboarding(): Promise<void> {
  if (!isStripeConfigured()) redirect("/app/invoices?stripe_error=stripe_not_configured");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/invoices");

  const { data: profile } = await supabase.from("profiles").select("id, stripe_account_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/app/invoices");

  const stripe = getStripe();
  let stripeAccountId = profile.stripe_account_id;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    stripeAccountId = account.id;

    const { error } = await supabase.from("profiles").update({ stripe_account_id: stripeAccountId }).eq("id", profile.id);
    if (error) redirect("/app/invoices?stripe_error=store_account_failed");
  }

  const origin = getPublicSiteUrl();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    return_url: `${origin}/app/invoices?stripe_onboarding=return`,
    refresh_url: `${origin}/app/invoices?stripe_onboarding=refresh`,
  });

  redirect(link.url);
}

export async function withdrawStripeFunds(): Promise<void> {
  if (!isStripeConfigured()) redirect("/app/invoices?withdraw_error=stripe_not_configured");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/invoices");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, stripe_account_id, stripe_payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id || !profile.stripe_account_id) redirect("/app/invoices?withdraw_error=missing_stripe_account");
  if (!profile.stripe_payouts_enabled) redirect("/app/invoices?withdraw_error=payouts_not_enabled");

  const stripe = getStripe();
  const stripeAccountId = profile.stripe_account_id;

  let balance: any;
  try {
    balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
  } catch (e) {
    redirect("/app/invoices?withdraw_error=balance_failed");
  }

  const eurAvailable = (balance.available ?? [])
    .filter((b: any) => b.currency === "eur")
    .reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0);

  if (eurAvailable <= 0) redirect("/app/invoices?withdraw_error=0");

  let payout;
  try {
    payout = await stripe.payouts.create(
      {
        amount: eurAvailable,
        currency: "eur",
      },
      { stripeAccount: stripeAccountId },
    );
  } catch (e) {
    redirect("/app/invoices?withdraw_error=payout_failed");
  }

  // Le solde peut mettre un peu de temps à refluer.
  revalidatePath("/app/invoices");
  redirect(`/app/invoices?withdraw_success=${encodeURIComponent(payout.id)}`);
}
