import type { SupabaseClient } from "@supabase/supabase-js";

import { formatContactDisplayName } from "@/lib/contacts/display-name";

import type { QuotePdfDocument } from "./render-quote-pdf";

export async function loadQuotePdfDocument(
  supabase: SupabaseClient,
  quoteId: string,
  artisanId: string,
): Promise<QuotePdfDocument | null> {
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, artisan_id, customer_name, customer_email, labor_total, materials_total, grand_total, notes, created_at, work_site_address, work_site_city, work_site_postal_code",
    )
    .eq("id", quoteId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (!quote) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "business_name, name, phone, address_line1, postal_code, city, siren, siret, vat_number, trade_register_number, decennale_insurer, decennale_policy_number, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url, logo_url",
    )
    .eq("id", artisanId)
    .maybeSingle();

  if (!profile) return null;

  const [{ data: services }, { data: materials }] = await Promise.all([
    supabase
      .from("quote_services")
      .select("service_title, duration_minutes, unit_price, line_total")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_materials")
      .select("label, quantity, unit_price, line_total")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
  ]);

  const validUntil = new Date(quote.created_at);
  validUntil.setMonth(validUntil.getMonth() + 2);

  const workSite = [quote.work_site_address, quote.work_site_postal_code, quote.work_site_city]
    .filter(Boolean)
    .join(", ");

  return {
    quoteNumber: quote.id.slice(0, 8).toUpperCase(),
    issueDate: new Date(quote.created_at),
    validUntil,
    seller: {
      business_name: profile.business_name,
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
      phone: profile.phone,
      logoUrl: profile.logo_url,
    },
    buyer: {
      name: formatContactDisplayName({ name: quote.customer_name, email: quote.customer_email }),
      email: quote.customer_email,
    },
    serviceLines: (services ?? []).map((s) => ({
      label: s.service_title,
      detail: `${s.duration_minutes} min`,
      amountCents: s.line_total ?? s.unit_price ?? 0,
    })),
    materialLines: (materials ?? []).map((m) => ({
      label: m.label,
      detail: `Qté ${m.quantity}`,
      amountCents: m.line_total ?? m.unit_price * m.quantity,
    })),
    laborTotalCents: quote.labor_total ?? 0,
    materialsTotalCents: quote.materials_total ?? 0,
    grandTotalCents: quote.grand_total ?? 0,
    notes: quote.notes,
    workSiteAddress: workSite || null,
  };
}
