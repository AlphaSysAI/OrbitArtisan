"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireArtisanProfileIdOrRedirect, requireAuthenticatedUser, resolveArtisanProfile } from "@/lib/auth/require-artisan";

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

export async function createInvoiceFromQuote(quoteId: string): Promise<void> {
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
    .select("label, quantity, unit_price, line_total, vat_rate, exclude_from_invoice")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  for (const m of qMaterials ?? []) {
    // Importants facturation (Vague 2) : un matériau marqué "hors facture" au
    // devis ne doit jamais être reproratisé et facturé.
    if (m.exclude_from_invoice) continue;
    const lt = m.line_total ?? m.unit_price * m.quantity;
    const scaled = quote.grand_total > 0 ? Math.round((lt * billableRemaining) / quote.grand_total) : 0;
    if (scaled <= 0) continue;
    lines.push({
      invoice_id: invoice.id,
      line_kind: "material",
      label: m.label,
      quantity: m.quantity,
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

/**
 * NB : cette action semble inutilisée (aucun import trouvé ailleurs dans le
 * code — voir InvoiceEditForm/updateInvoiceDetail, câblée elle sur la page
 * de détail). Conservée mais corrigée par prudence en même temps que son
 * quasi-doublon, pour ne pas laisser une action non câblée réintroduire le
 * même risque si elle est un jour rebranchée.
 */
export async function updateInvoice(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "draft").trim();

  if (!invoiceId) redirect("/app/invoices");
  if (!["draft", "sent", "paid", "overdue"].includes(status)) redirect(`/app/invoices/${invoiceId}?error=status`);

  const { supabase, profileId } = await requireArtisanProfileIdOrRedirect();

  const { data: inv } = await supabase.from("invoices").select("id, artisan_id").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.artisan_id !== profileId) redirect("/app/invoices");

  // Point 4 audit pré-pilote : invoice_number n'est plus jamais écrit ici —
  // attribué automatiquement à la finalisation (compteur séquentiel).
  const { error } = await supabase
    .from("invoices")
    .update({
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

const FINALIZE_ERROR_MESSAGES: Record<string, string> = {
  not_found: "Facture introuvable.",
  already_finalized: "Cette facture est déjà finalisée.",
  not_draft: "Seul un brouillon peut être finalisé.",
  no_lines: "Ajoute des lignes via le devis avant de finaliser.",
  invoicing_frozen:
    "Facturation désactivée pour ce client professionnel (SIREN + TVA renseignés) — en attente du raccordement à une Plateforme Agréée pour la transmission Factur-X, obligatoire pour les clients B2B. La facturation des particuliers reste disponible.",
  generation_failed: "Échec de génération du document.",
  pa_submission_failed: "Échec d'envoi à la Plateforme Agréée.",
  persist_failed: "Impossible d'enregistrer la finalisation.",
};

export async function finalizeInvoiceForm(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/app/invoices?error=missing");

  const { supabase, profileId } = await requireArtisanProfileIdOrRedirect([], "/login?next=/app/invoices");

  const { createInvoiceService } = await import("@/lib/billing/invoicing");
  const service = createInvoiceService(supabase);
  const result = await service.finalize(invoiceId, profileId);

  if (!result.ok) {
    const code = result.code in FINALIZE_ERROR_MESSAGES ? result.code : "persist_failed";
    redirect(`/app/invoices/${invoiceId}?finalize_error=${encodeURIComponent(code)}`);
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);

  redirect(
    `/app/invoices/${invoiceId}?finalized=1&flow=${encodeURIComponent(result.flow)}&download=1`,
  );
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

    const { error } = await supabase.from("profiles").update({ stripe_account_id: stripeAccountId }).eq("id", profileId);
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
