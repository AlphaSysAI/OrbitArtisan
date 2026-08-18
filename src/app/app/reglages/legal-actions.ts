"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateLegalEntityFields } from "@/lib/billing/legal-entity-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const legal = validateLegalEntityFields({ siren, siret, vat_number: vatNumber });
  if (!legal.ok) {
    return { ok: false as const, error: legal.error };
  }

  const paymentTerms = Number.isFinite(paymentTermsRaw) ? Math.min(365, Math.max(0, Math.round(paymentTermsRaw))) : 30;
  const retentionRate = Number.isFinite(retentionRaw) ? Math.min(10, Math.max(0, retentionRaw)) : 5;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages?tab=facturation");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false as const, error: "save_failed" as const };

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
    })
    .eq("id", profile.id);

  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/app/reglages");
  revalidatePath("/app/invoices");
  return { ok: true as const };
}
