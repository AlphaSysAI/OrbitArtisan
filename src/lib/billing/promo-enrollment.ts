import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AMBASSADOR_PROGRAM,
  isPromoReserveResult,
  type PromoEnrollment,
  type PromoEnrollmentStatus,
  type PromoProgramStatus,
  type PromoReserveResult,
} from "@/lib/billing/promo-program";

function isEnrollmentStatus(value: unknown): value is PromoEnrollmentStatus {
  return (
    value === "registered" ||
    value === "pending" ||
    value === "active" ||
    value === "lapsed" ||
    value === "forfeited"
  );
}

/** Lecture de l'inscription promo d'un profil (RLS : l'artisan ne voit que la sienne). */
export async function getPromoEnrollment(
  supabase: SupabaseClient,
  profileId: string,
): Promise<PromoEnrollment | null> {
  const { data, error } = await supabase
    .from("promo_enrollments")
    .select("program_code, status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.error("[promo] lecture inscription", { profileId, error });
    return null;
  }
  if (!data || !isEnrollmentStatus(data.status)) return null;

  return { programCode: data.program_code as string, status: data.status };
}

/** Places restantes du programme ambassadeur (affichage). */
export async function getAmbassadorProgramStatus(supabase: SupabaseClient): Promise<PromoProgramStatus | null> {
  const { data, error } = await supabase.rpc("promo_program_status", { p_code: AMBASSADOR_PROGRAM.code });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) {
    if (error) console.error("[promo] statut programme", error);
    return null;
  }
  return { remainingSlots: Number(row.remaining_slots ?? 0), isOpen: !!row.is_open };
}

/**
 * Bloque une place pendant le paiement (service role). Atomique côté SQL :
 * jamais plus de places que prévu, même avec des paiements simultanés.
 */
export async function reservePromoSlot(admin: SupabaseClient, profileId: string): Promise<PromoReserveResult | null> {
  const { data, error } = await admin.rpc("reserve_promo_slot", {
    p_profile_id: profileId,
    p_hold_minutes: AMBASSADOR_PROGRAM.holdMinutes,
  });
  if (error || !isPromoReserveResult(data)) {
    console.error("[promo] blocage de place", { profileId, error, data });
    return null;
  }
  return data;
}

export async function attachPromoCheckoutSession(
  admin: SupabaseClient,
  profileId: string,
  checkoutSessionId: string,
): Promise<void> {
  const { error } = await admin
    .from("promo_enrollments")
    .update({ stripe_checkout_session_id: checkoutSessionId })
    .eq("profile_id", profileId)
    .eq("status", "pending");
  if (error) console.error("[promo] rattachement session", { profileId, error });
}

/**
 * Webhook checkout : paiement confirmé avec le coupon → place définitivement prise.
 * Accepte aussi un blocage expiré (paiement validé tardivement par Stripe) : le
 * client a payé au tarif remisé, on honore l'offre.
 */
export async function markPromoEnrollmentActive(
  admin: SupabaseClient,
  profileId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  const { error } = await admin
    .from("promo_enrollments")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      hold_expires_at: null,
      stripe_subscription_id: stripeSubscriptionId,
    })
    .eq("profile_id", profileId)
    .in("status", ["pending", "registered", "lapsed"]);

  if (error) console.error("[promo] activation", { profileId, stripeSubscriptionId, error });
}

/** Webhook résiliation : la remise est définitivement perdue (CGV, tarif ambassadeur). */
export async function forfeitPromoEnrollmentForSubscription(
  admin: SupabaseClient,
  stripeSubscriptionId: string,
): Promise<void> {
  const { error } = await admin
    .from("promo_enrollments")
    .update({ status: "forfeited", forfeited_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .eq("status", "active");

  if (error) console.error("[promo] perte de la remise", { stripeSubscriptionId, error });
}
