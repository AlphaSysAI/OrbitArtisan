import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { validateQuoteLegalProfile, type QuoteLegalValidation } from "@/lib/billing/quote-pdf-legal";

export type QuoteSendValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: "quote_not_found" | "quote_pdf_profile_incomplete"; validation: QuoteLegalValidation };

export async function validateQuoteBeforeSend(
  supabase: SupabaseClient,
  quoteId: string,
  artisanId: string,
): Promise<QuoteSendValidationResult> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, customer_name, customer_email")
    .eq("id", quoteId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (!quote) {
    return {
      ok: false,
      error: "quote_not_found",
      validation: { ok: false, blocking: ["Devis introuvable."], warnings: [] },
    };
  }

  if (!quote.customer_name?.trim() && !quote.customer_email?.trim()) {
    return {
      ok: false,
      error: "quote_pdf_profile_incomplete",
      validation: {
        ok: false,
        blocking: ["Renseigne au minimum le nom ou l'e-mail du client avant envoi."],
        warnings: [],
      },
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "business_name, siren, siret, address_line1, postal_code, city, vat_number, trade_register_number, decennale_insurer, decennale_policy_number, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url",
    )
    .eq("id", artisanId)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      error: "quote_pdf_profile_incomplete",
      validation: { ok: false, blocking: ["Profil artisan introuvable."], warnings: [] },
    };
  }

  const validation = validateQuoteLegalProfile({
    business_name: profile.business_name,
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
  });

  if (!validation.ok) {
    return { ok: false, error: "quote_pdf_profile_incomplete", validation };
  }

  return { ok: true, warnings: validation.warnings };
}
