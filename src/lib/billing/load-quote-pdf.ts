import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildQuotePdfTableLines,
  computeVatBreakdown,
  normalizeVatRate,
  sumQuoteTotals,
} from "@/lib/billing/build-quote-pdf-lines";
import {
  buildQuoteRetractionLines,
  buildQuotePdfFooterLines,
  validateQuoteLegalProfile,
} from "@/lib/billing/quote-pdf-legal";
import type { QuotePdfDocument } from "@/lib/billing/quote-pdf-types";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { splitSalesTermsLines } from "@/lib/legal/default-artisan-sales-terms";

async function fetchLogoBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url?.trim()) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function ensureQuoteNumber(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("allocate_quote_number", { p_quote_id: quoteId });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

type QuotePdfRow = {
  id: string;
  artisan_id: string;
  customer_name: string | null;
  customer_email: string | null;
  labor_rate_per_hour: number | null;
  labor_duration_minutes: number | null;
  labor_total: number | null;
  materials_total: number | null;
  grand_total: number | null;
  notes: string | null;
  created_at: string;
  work_site_address: string | null;
  work_site_city: string | null;
  work_site_postal_code: string | null;
  reduced_vat_rate: number | null;
  generate_vat_attestation: boolean | null;
  quote_number?: string | null;
  retraction_waived?: boolean | null;
  valid_until?: string | null;
};

type ProfilePdfRow = {
  business_name: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  trade_register_number: string | null;
  decennale_insurer: string | null;
  decennale_policy_number: string | null;
  rc_pro_insurer: string | null;
  rc_pro_number: string | null;
  mediator_name: string | null;
  mediator_url: string | null;
  logo_url: string | null;
  default_payment_terms_days: number | null;
  sales_terms_text?: string | null;
};

export async function loadQuotePdfDocument(
  supabase: SupabaseClient,
  quoteId: string,
  artisanId: string,
): Promise<QuotePdfDocument | null> {
  const quoteNumber = (await ensureQuoteNumber(supabase, quoteId)) ?? null;

  // select("*") : compatible si migrations 22–25 pas encore appliquées (colonnes optionnelles absentes).
  const { data: quoteRaw, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (quoteError || !quoteRaw) return null;
  const quote = quoteRaw as QuotePdfRow;

  const { data: profileRaw, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", artisanId)
    .maybeSingle();

  if (profileError || !profileRaw) return null;
  const profile = profileRaw as ProfilePdfRow;

  const [{ data: services }, { data: materials }] = await Promise.all([
    supabase
      .from("quote_services")
      .select("service_title, duration_minutes, unit_price, line_total")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_materials")
      .select("label, quantity, unit_price, line_total, vat_rate, exclude_from_invoice, supplier_url")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
  ]);

  const issueDate = new Date(quote.created_at);
  // Priorité à la date figée en base (celle que client_accept_quote vérifie) ;
  // repli sur l'ancien calcul pour un devis créé avant la migration 24.
  let validUntil: Date;
  if (quote.valid_until?.trim()) {
    validUntil = new Date(`${quote.valid_until}T00:00:00Z`);
  } else {
    validUntil = new Date(issueDate);
    validUntil.setMonth(validUntil.getMonth() + 3);
  }

  const workSite = [quote.work_site_address, quote.work_site_postal_code, quote.work_site_city]
    .filter(Boolean)
    .join(", ");

  const defaultVatRate = normalizeVatRate(quote.reduced_vat_rate ?? 20);
  const tableLines = buildQuotePdfTableLines({
    services: services ?? [],
    materials: materials ?? [],
    laborTotalCents: quote.labor_total ?? 0,
    laborDurationMinutes: quote.labor_duration_minutes ?? 0,
    laborRatePerHourCents: quote.labor_rate_per_hour ?? 0,
    defaultVatRate,
  });

  const vatBreakdown = computeVatBreakdown(tableLines);
  const totals = sumQuoteTotals(vatBreakdown);

  const directPurchaseLines = (materials ?? [])
    .filter((m) => m.exclude_from_invoice && (m.unit_price ?? 0) > 0)
    .map((m) => {
      const unitPriceCents = m.unit_price ?? 0;
      const quantity = m.quantity ?? 0;
      return {
        label: m.label ?? "",
        quantity,
        unitPriceCents,
        lineTotalCents: Math.round(quantity * unitPriceCents),
        supplierUrl: m.supplier_url ?? null,
      };
    });

  const legalProfile = {
    business_name: profile.business_name ?? "",
    name: profile.name,
    siren: profile.siren,
    siret: profile.siret,
    vat_number: profile.vat_number,
    trade_register_number: profile.trade_register_number,
    decennale_insurer: profile.decennale_insurer,
    decennale_policy_number: profile.decennale_policy_number,
    rc_pro_insurer: profile.rc_pro_insurer,
    rc_pro_number: profile.rc_pro_number,
    mediator_name: profile.mediator_name,
    mediator_url: profile.mediator_url,
    addressLine1: profile.address_line1,
    postalCode: profile.postal_code,
    city: profile.city,
    email: profile.email,
  };

  const validation = validateQuoteLegalProfile(legalProfile);
  const displayNumber =
    quote.quote_number ?? quoteNumber ?? quote.id.slice(0, 8).toUpperCase();

  const logoBytes = await fetchLogoBytes(profile.logo_url);

  return {
    quoteNumber: displayNumber,
    issueDate,
    validUntil,
    paymentTermsDays: profile.default_payment_terms_days ?? 30,
    defaultVatRate,
    seller: {
      ...legalProfile,
      phone: profile.phone,
      logoUrl: profile.logo_url,
      logoBytes,
    },
    buyer: {
      name: formatContactDisplayName({ name: quote.customer_name, email: quote.customer_email }),
      email: quote.customer_email,
    },
    tableLines,
    vatBreakdown,
    ...totals,
    notes: quote.notes,
    workSiteAddress: workSite || null,
    generateVatAttestation: !!quote.generate_vat_attestation,
    legalFooterLines: buildQuotePdfFooterLines({
      profile: legalProfile,
      validUntil,
      paymentTermsDays: profile.default_payment_terms_days ?? 30,
      generateVatAttestation: !!quote.generate_vat_attestation,
    }),
    legalWarnings: validation.warnings,
    retractionNotice: buildQuoteRetractionLines({
      profile: legalProfile,
      retractionWaived: !!quote.retraction_waived,
    }),
    salesTermsLines: splitSalesTermsLines(profile.sales_terms_text),
    directPurchaseLines,
  };
}
