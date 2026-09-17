"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateLegalEntityFields } from "@/lib/billing/legal-entity-validation";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";

export async function updateLegalSettings(formData: FormData) {
  const siren = String(formData.get("siren") ?? "").trim() || null;
  const siret = String(formData.get("siret") ?? "").trim() || null;
  const vatNumber = String(formData.get("vat_number") ?? "").trim() || null;
  const tradeRegisterNumber = String(formData.get("trade_register_number") ?? "").trim() || null;
  const decennaleInsurer = String(formData.get("decennale_insurer") ?? "").trim() || null;
  const decennalePolicyNumber = String(formData.get("decennale_policy_number") ?? "").trim() || null;
  const rcProInsurer = String(formData.get("rc_pro_insurer") ?? "").trim() || null;
  const rcProNumber = String(formData.get("rc_pro_number") ?? "").trim() || null;
  const mediatorName = String(formData.get("mediator_name") ?? "").trim() || null;
  const mediatorUrl = String(formData.get("mediator_url") ?? "").trim() || null;
  const paymentTermsRaw = Number(formData.get("default_payment_terms_days"));
  const retentionRaw = Number(String(formData.get("default_retention_rate") ?? "").replace(",", "."));
  const autoReminderEnabled = formData.get("auto_reminder_enabled") === "on";
  const salesTermsRaw = String(formData.get("sales_terms_text") ?? "").trim();
  const salesTermsText = salesTermsRaw ? salesTermsRaw.slice(0, 12000) : null;

  const legal = validateLegalEntityFields({ siren, siret, vat_number: vatNumber });
  if (!legal.ok) {
    return { ok: false as const, error: legal.error };
  }

  const paymentTerms = Number.isFinite(paymentTermsRaw) ? Math.min(365, Math.max(0, Math.round(paymentTermsRaw))) : 30;
  const retentionRate = Number.isFinite(retentionRaw) ? Math.min(10, Math.max(0, retentionRaw)) : 5;

  const auth = await requireArtisanProfileId();
  if (!auth.ok) {
    if (auth.error === "auth") redirect("/login?next=/app/reglages?tab=facturation");
    return { ok: false as const, error: "save_failed" as const };
  }
  const { supabase, profileId } = auth;

  const { error } = await supabase
    .from("profiles")
    .update({
      siren: legal.fields.siren,
      siret: legal.fields.siret,
      vat_number: legal.fields.vat_number,
      trade_register_number: tradeRegisterNumber,
      decennale_insurer: decennaleInsurer,
      decennale_policy_number: decennalePolicyNumber,
      rc_pro_insurer: rcProInsurer,
      rc_pro_number: rcProNumber,
      mediator_name: mediatorName,
      mediator_url: mediatorUrl,
      default_payment_terms_days: paymentTerms,
      default_retention_rate: retentionRate,
      auto_reminder_enabled: autoReminderEnabled,
      sales_terms_text: salesTermsText,
    })
    .eq("id", profileId);

  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/app/reglages");
  revalidatePath("/app/invoices");
  revalidatePath("/app/quotes");
  return { ok: true as const };
}
