"use server";

import { allocateInvoiceCents } from "@/lib/billing/invoice-amounts";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser, resolveArtisanProfile } from "@/lib/auth/require-artisan";

import { redirectIfCannotCreateDocuments } from "@/lib/billing/require-document-access";
import {
  computeDepositForQuote,
  computeProgressForQuote,
  createTypedInvoiceFromQuote,
  sumInvoicedOnQuote,
  insertInvoiceDraft,
  type InvoiceDraftLine,
} from "@/lib/billing/create-btp-invoice";
import { computeRemainingBillableCents } from "@/lib/billing/invoice-types";
import { DEFAULT_INVOICE_EINVOICING, vatFieldsForRate } from "@/lib/billing/einvoicing-types";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { frozenInvoicingResult, isDraftInvoicingFrozenForCustomer } from "@/lib/billing/invoicing-freeze";
import { resolveCustomerClassification } from "@/lib/billing/invoicing/resolve-customer-classification";

export async function createInvoiceFromQuoteForm(formData: FormData): Promise<void> {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  if (!quoteId) redirect("/app/invoices?error=missing");
  await createInvoiceFromQuote(quoteId);
}

async function createInvoiceFromQuote(quoteId: string): Promise<void> {
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) redirect("/login");
  const { supabase, userId } = userAuth;

  await redirectIfCannotCreateDocuments(supabase, userId);

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, ["default_retention_rate"]);
  if (!resolvedProfile.ok) redirect("/login");
  const { profileId, profile } = resolvedProfile;
  const defaultRetentionRate = Number((profile.default_retention_rate as number | null) ?? 0);

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, artisan_id, status, customer_user_id, customer_name, customer_email, labor_total, materials_total, grand_total, labor_duration_minutes, notes, reduced_vat_rate",
    )
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!quote || quote.status !== "accepted") {
    redirect(`/app/quotes/${quoteId}?error=invoice`);
  }

  // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts).
  const customerClass = await resolveCustomerClassification(supabase, quote.customer_user_id);
  if (isDraftInvoicingFrozenForCustomer(customerClass)) {
    redirect(`/app/quotes/${quoteId}?error=invoicing_frozen`);
  }

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId).catch(() => null);
  if (alreadyInvoiced === null) redirect(`/app/quotes/${quoteId}?error=invoice`);
  const remaining = computeRemainingBillableCents(quote.grand_total, alreadyInvoiced);
  if (remaining <= 0) redirect(`/app/quotes/${quoteId}?error=fully_invoiced`);

  const { data: materials, error: materialsError } = await supabase
    .from("quote_materials")
    .select("label, quantity, unit_price, line_total, vat_rate, unit")
    .eq("quote_id", quoteId)
    .eq("exclude_from_invoice", false)
    .order("created_at").order("id");
  if (materialsError) redirect(`/app/quotes/${quoteId}?error=invoice_lines`);
  const sourceMaterials = materials ?? [];
  const weights = [quote.labor_total, ...sourceMaterials.map((line) => line.line_total)];
  if (weights.some((value) => value < 0) || weights.reduce((sum, value) => sum + value, 0) !== quote.grand_total) {
    redirect(`/app/quotes/${quoteId}?error=invoice_lines`);
  }

  const invoiceType = alreadyInvoiced > 0 ? "final" : "standard";
  const retentionRate = invoiceType === "final" ? defaultRetentionRate : 0;
  const retentionAmount = Math.round((remaining * retentionRate) / 100);
  const billableRemaining = remaining - retentionAmount;
  const [laborShare, ...materialShares] = allocateInvoiceCents(billableRemaining, weights);
  const lines: InvoiceDraftLine[] = [];
  if (laborShare > 0) lines.push({
    line_kind: "labor",
    label: `Main d'œuvre (${quote.labor_duration_minutes} min)${invoiceType === "final" ? " — solde" : ""}`,
    quantity: 1,
    unit_price: laborShare,
    line_total: laborShare,
    ...vatFieldsForRate(quote.reduced_vat_rate),
  });
  sourceMaterials.forEach((material, index) => {
    const share = materialShares[index];
    if (share <= 0) return;
    lines.push({
      line_kind: "material",
      label: material.label,
      quantity: material.quantity,
      unit: material.unit ?? null,
      unit_price: Math.round(share / material.quantity),
      line_total: share,
      ...vatFieldsForRate(material.vat_rate),
    });
  });

  const result = await insertInvoiceDraft(supabase, {
    artisan_id: profileId,
    quote_id: quoteId,
    customer_user_id: quote.customer_user_id,
    customer_name: quote.customer_name,
    customer_email: quote.customer_email,
    invoice_type: invoiceType,
    quote_reference_total: quote.grand_total,
    progress_percentage: invoiceType === "standard" ? 100 : null,
    retention_rate: retentionRate,
    retention_amount: retentionAmount,
    ...DEFAULT_INVOICE_EINVOICING,
    labor_total: laborShare,
    materials_total: billableRemaining - laborShare,
    grand_total: billableRemaining,
    notes: retentionAmount > 0 ? `${quote.notes ?? ""}\n\nRetenue de garantie ${retentionRate} % : ${(retentionAmount / 100).toFixed(2)} € retenus.`.trim() : quote.notes,
  }, lines, alreadyInvoiced);
  if (!result.ok) redirect(`/app/quotes/${quoteId}?error=invoice_insert`);
  const invoice = { id: result.invoiceId };

  revalidatePath("/app/invoices");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/quotes");
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoice.id}`);
  redirect(`/app/invoices/${invoice.id}`);
}

export async function startStripeExpressOnboarding(): Promise<void> {
  if (!isStripeConfigured()) redirect("/app/invoices?stripe_error=stripe_not_configured");

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) redirect("/login?next=/app/invoices");
  const { supabase, userId } = userAuth;

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, ["stripe_account_id"]);
  if (!resolvedProfile.ok) redirect("/app/invoices");
  // Compte d'encaissement : réservé au titulaire.
  if (!resolvedProfile.isOwner) redirect("/app/invoices?stripe_error=owner_only");
  const { profileId, profile } = resolvedProfile;

  const stripe = getStripe();
  let stripeAccountId = profile.stripe_account_id as string | null;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    stripeAccountId = account.id;

    // Colonne protégée (migration 55) : écrite par le serveur uniquement.
    const admin = createSupabaseServiceRoleClient();
    const { error } = admin
      ? await admin.from("profiles").update({ stripe_account_id: stripeAccountId }).eq("id", profileId).is("stripe_account_id", null)
      : { error: { message: "service_role" } };
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

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) redirect("/login?next=/app/invoices");
  const { supabase, userId } = userAuth;

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, ["stripe_account_id", "stripe_payouts_enabled"]);
  if (!resolvedProfile.ok || !resolvedProfile.profile.stripe_account_id) {
    redirect("/app/invoices?withdraw_error=missing_stripe_account");
  }
  if (!resolvedProfile.isOwner) redirect("/app/invoices?withdraw_error=owner_only");
  const { profile } = resolvedProfile;
  if (!profile.stripe_payouts_enabled) redirect("/app/invoices?withdraw_error=payouts_not_enabled");

  const stripe = getStripe();
  const stripeAccountId = profile.stripe_account_id as string;

  let balance: Awaited<ReturnType<typeof stripe.balance.retrieve>>;
  try {
    balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
  } catch {
    redirect("/app/invoices?withdraw_error=balance_failed");
  }

  const eurAvailable = (balance.available ?? [])
    .filter((b) => b.currency === "eur")
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);

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
  } catch {
    redirect("/app/invoices?withdraw_error=payout_failed");
  }

  // Le solde peut mettre un peu de temps à refluer.
  revalidatePath("/app/invoices");
  redirect(`/app/invoices?withdraw_success=${encodeURIComponent(payout.id)}`);
}

export async function createDepositInvoice(
  quoteId: string,
  percent: number,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return { ok: false, error: "invalid_percent" };
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) return { ok: false, error: "auth" };
  const { supabase, userId } = userAuth;

  await redirectIfCannotCreateDocuments(supabase, userId);

  const resolvedProfile = await resolveArtisanProfile(supabase, userId);
  if (!resolvedProfile.ok) return { ok: false, error: "profile" };
  const { profileId } = resolvedProfile;

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, artisan_id, status, customer_user_id, customer_name, customer_email, grand_total, notes, reduced_vat_rate")
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!quote) return { ok: false, error: "not_found" };

  // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts).
  const customerClass = await resolveCustomerClassification(supabase, quote.customer_user_id);
  if (isDraftInvoicingFrozenForCustomer(customerClass)) return frozenInvoicingResult();

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId).catch(() => null);
  if (alreadyInvoiced === null) return { ok: false, error: "invoice_total_read_failed" };
  const amount = computeDepositForQuote(quote.grand_total, percent, alreadyInvoiced);
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const result = await createTypedInvoiceFromQuote(supabase, profileId, quote, {
    invoiceType: "deposit",
    amountCents: amount,
    expectedInvoiced: alreadyInvoiced,
    progressPercentage: percent,
    label: `Acompte ${percent} % sur devis accepté`,
    notes: `Facture d'acompte — ${percent} % du montant total du devis.`,
  });

  if (!result.ok) return result;

  revalidatePath("/app/invoices");
  revalidatePath(`/app/quotes/${quoteId}`);
  return result;
}

export async function createProgressInvoice(
  quoteId: string,
  cumulativePercent: number,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (!Number.isFinite(cumulativePercent) || cumulativePercent <= 0 || cumulativePercent > 100) return { ok: false, error: "invalid_percent" };
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) return { ok: false, error: "auth" };
  const { supabase, userId } = userAuth;

  await redirectIfCannotCreateDocuments(supabase, userId);

  const resolvedProfile = await resolveArtisanProfile(supabase, userId);
  if (!resolvedProfile.ok) return { ok: false, error: "profile" };
  const { profileId } = resolvedProfile;

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, artisan_id, status, customer_user_id, customer_name, customer_email, grand_total, notes, reduced_vat_rate")
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .maybeSingle();

  if (!quote) return { ok: false, error: "not_found" };

  // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts).
  const customerClass = await resolveCustomerClassification(supabase, quote.customer_user_id);
  if (isDraftInvoicingFrozenForCustomer(customerClass)) return frozenInvoicingResult();

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId).catch(() => null);
  if (alreadyInvoiced === null) return { ok: false, error: "invoice_total_read_failed" };
  const amount = computeProgressForQuote(quote.grand_total, cumulativePercent, alreadyInvoiced);
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const result = await createTypedInvoiceFromQuote(supabase, profileId, quote, {
    invoiceType: "progress",
    amountCents: amount,
    expectedInvoiced: alreadyInvoiced,
    progressPercentage: cumulativePercent,
    label: `Situation d'avancement — ${cumulativePercent} % cumulé`,
    notes: `Facture de situation — avancement cumulé ${cumulativePercent} % du devis.`,
  });

  if (!result.ok) return result;

  revalidatePath("/app/invoices");
  revalidatePath(`/app/quotes/${quoteId}`);
  return result;
}
