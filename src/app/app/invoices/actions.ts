"use server";

import { materialLineTotalCents } from "@/lib/quotes/material-quantity";
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

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId);
  const remaining = computeRemainingBillableCents(quote.grand_total, alreadyInvoiced);
  if (remaining <= 0) redirect(`/app/quotes/${quoteId}?error=fully_invoiced`);

  const invoiceType = alreadyInvoiced > 0 ? "final" : "standard";
  // Point 4 audit pré-pilote : plus de numéro généré ici — attribué à la
  // finalisation via allocate_invoice_number() (InvoiceService.finalize).

  let laborShare = quote.grand_total > 0 ? Math.round((quote.labor_total * remaining) / quote.grand_total) : 0;
  let materialsShare = remaining - laborShare;

  const retentionRate = invoiceType === "final" || alreadyInvoiced > 0 ? defaultRetentionRate : 0;
  const retentionAmount =
    retentionRate > 0 && remaining === computeRemainingBillableCents(quote.grand_total, alreadyInvoiced)
      ? Math.round((remaining * retentionRate) / 100)
      : 0;
  const billableRemaining = remaining - retentionAmount;
  if (retentionAmount > 0) {
    materialsShare = billableRemaining - laborShare;
    if (materialsShare < 0) {
      // Importants facturation (Vague 2) : la retenue de garantie dépasse la
      // part matériaux calculée — le surplus est absorbé par la main-d'œuvre
      // plutôt que simplement tronqué, sinon labor_total + materials_total
      // ne correspond plus à grand_total sur la facture enregistrée.
      laborShare = billableRemaining;
      materialsShare = 0;
    }
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      artisan_id: profileId,
      quote_id: quoteId,
      customer_user_id: quote.customer_user_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      invoice_number: null,
      status: "draft",
      invoice_type: invoiceType,
      quote_reference_total: quote.grand_total,
      progress_percentage: alreadyInvoiced > 0 ? null : 100,
      retention_rate: retentionRate > 0 ? retentionRate : 0,
      retention_amount: retentionAmount,
      ...DEFAULT_INVOICE_EINVOICING,
      labor_total: laborShare,
      materials_total: materialsShare,
      grand_total: billableRemaining,
      notes: retentionAmount > 0 ? `${quote.notes ?? ""}\n\nRetenue de garantie ${retentionRate} % : ${(retentionAmount / 100).toFixed(2)} € retenus.`.trim() : quote.notes,
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
    vat_rate: number;
    vat_exemption_reason: string | null;
    vat_category_code: string;
    unit?: string | null;
  }[] = [];

  // Point 2 audit pré-pilote : on n'ajoute plus JAMAIS de ligne par prestation
  // catalogue (ex quote_services) en plus de la ligne "Main d'œuvre" globale.
  // Raison : quote_services.unit_price/line_total sont un instantané du champ
  // "Prix" du catalogue de prestations (services.price) — un champ purement
  // décoratif qui n'entre JAMAIS dans le calcul de quote.labor_total (voir
  // Point Vague 4 "champ Prix jamais utilisé dans grand_total"). Facturer les
  // deux revenait à additionner deux sources de montant indépendantes pour la
  // même main-d'œuvre : la ligne globale (laborShare, dérivée du vrai taux
  // horaire artisan) ET une deuxième liste de lignes basée sur des prix
  // catalogue sans rapport avec le total réellement dû — d'où un total HT
  // facturé supérieur au montant du devis accepté par le client.
  // Point 3 audit pré-pilote : le taux de TVA de chaque ligne suit désormais
  // le devis (reduced_vat_rate pour la main-d'œuvre, vat_rate par matériau
  // pour les fournitures), au lieu du DEFAULT_INVOICE_LINE_VAT fixe à 20 %.
  let sort = 0;
  if (laborShare > 0) {
    lines.push({
      invoice_id: invoice.id,
      line_kind: "labor",
      label: `Main d'œuvre (${quote.labor_duration_minutes} min)${alreadyInvoiced > 0 ? " — solde" : ""}`,
      quantity: 1,
      unit_price: laborShare,
      line_total: laborShare,
      sort_order: sort++,
      ...vatFieldsForRate(quote.reduced_vat_rate),
    });
  }

  const { data: qMaterials } = await supabase
    .from("quote_materials")
    .select("label, quantity, unit_price, line_total, vat_rate, exclude_from_invoice, unit")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  for (const m of qMaterials ?? []) {
    // Importants facturation (Vague 2) : un matériau marqué "hors facture" au
    // devis ne doit jamais être reproratisé et facturé.
    if (m.exclude_from_invoice) continue;
    const lt = m.line_total ?? materialLineTotalCents(m.quantity, m.unit_price);
    const scaled = quote.grand_total > 0 ? Math.round((lt * billableRemaining) / quote.grand_total) : 0;
    if (scaled <= 0) continue;
    lines.push({
      invoice_id: invoice.id,
      line_kind: "material",
      label: m.label,
      quantity: m.quantity,
      unit: (m.unit as string | null) ?? null,
      unit_price: Math.round(scaled / m.quantity),
      line_total: scaled,
      sort_order: sort++,
      ...vatFieldsForRate(m.vat_rate),
    });
  }

  if (lines.length === 0) {
    lines.push({
      invoice_id: invoice.id,
      line_kind: "service",
      label: alreadyInvoiced > 0 ? "Solde sur devis accepté" : "Prestations et fournitures",
      quantity: 1,
      unit_price: billableRemaining,
      line_total: billableRemaining,
      sort_order: 0,
      ...vatFieldsForRate(quote.reduced_vat_rate),
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

export async function startStripeExpressOnboarding(): Promise<void> {
  if (!isStripeConfigured()) redirect("/app/invoices?stripe_error=stripe_not_configured");

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) redirect("/login?next=/app/invoices");
  const { supabase, userId } = userAuth;

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, ["stripe_account_id"]);
  if (!resolvedProfile.ok) redirect("/app/invoices");
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

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId);
  const amount = computeDepositForQuote(quote.grand_total, percent, alreadyInvoiced);
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const result = await createTypedInvoiceFromQuote(supabase, profileId, quote, {
    invoiceType: "deposit",
    amountCents: amount,
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

  const alreadyInvoiced = await sumInvoicedOnQuote(supabase, quoteId);
  const amount = computeProgressForQuote(quote.grand_total, cumulativePercent, alreadyInvoiced);
  if (amount <= 0) return { ok: false, error: "zero_amount" };

  const result = await createTypedInvoiceFromQuote(supabase, profileId, quote, {
    invoiceType: "progress",
    amountCents: amount,
    progressPercentage: cumulativePercent,
    label: `Situation d'avancement — ${cumulativePercent} % cumulé`,
    notes: `Facture de situation — avancement cumulé ${cumulativePercent} % du devis.`,
  });

  if (!result.ok) return result;

  revalidatePath("/app/invoices");
  revalidatePath(`/app/quotes/${quoteId}`);
  return result;
}
