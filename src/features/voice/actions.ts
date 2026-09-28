"use server";

import { revalidatePath } from "next/cache";

import {
  hasAnyVisitRange,
  parseVisitHours,
  VISIT_DURATION_OPTIONS,
} from "@/lib/appointments/visit-hours";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VoiceActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getArtisanVoiceNumber(): Promise<VoiceActionResult<{ phone: string | null }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Non authentifié" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return { success: false, error: "Accès refusé" };

    const { data } = await supabase
      .from("artisan_voice_numbers")
      .select("phone_e164")
      .eq("artisan_id", profile.id)
      .maybeSingle();

    return { success: true, data: { phone: (data?.phone_e164 as string) ?? null } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur serveur" };
  }
}

async function resolveOwnProfileId(): Promise<
  { ok: true; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; profileId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return { ok: false, error: "Accès refusé" };
  return { ok: true, supabase, profileId: profile.id as string };
}

/**
 * Plafond mensuel de dépassement Soline (en euros HT, entier).
 * 0 = aucun appel facturé hors forfait : Soline passe en message seul.
 */
export async function setVoiceOverageCap(capEuros: number): Promise<VoiceActionResult> {
  try {
    if (!Number.isFinite(capEuros) || capEuros < 0 || capEuros > 1000) {
      return { success: false, error: "Plafond invalide (entre 0 et 1 000 € HT)." };
    }
    const auth = await resolveOwnProfileId();
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await auth.supabase
      .from("profiles")
      .update({ voice_overage_cap_cents: Math.round(capEuros) * 100 })
      .eq("id", auth.profileId);

    if (error) {
      return {
        success: false,
        error: error.message.includes("voice_overage_cap_cents")
          ? "Migration 37_soline_calls_pricing.sql non appliquée."
          : error.message,
      };
    }

    revalidatePath("/app/reglages");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur serveur" };
  }
}

/** Plages de visite proposées par Soline au téléphone (null = RDV vocal désactivé). */
export async function saveVisitHours(input: {
  hours: unknown;
  durationMinutes: number;
}): Promise<VoiceActionResult> {
  try {
    if (!(VISIT_DURATION_OPTIONS as readonly number[]).includes(input.durationMinutes)) {
      return { success: false, error: "Durée de visite invalide." };
    }
    const parsed = input.hours == null ? null : parseVisitHours(input.hours);
    if (parsed && !parsed.ok) return { success: false, error: parsed.error };

    const auth = await resolveOwnProfileId();
    if (!auth.ok) return { success: false, error: auth.error };

    const value = parsed?.ok && hasAnyVisitRange(parsed.value) ? parsed.value : null;
    const { error } = await auth.supabase
      .from("profiles")
      .update({ visit_hours: value, visit_duration_minutes: input.durationMinutes })
      .eq("id", auth.profileId);

    if (error) {
      return {
        success: false,
        error: error.message.includes("visit_hours")
          ? "Migration 38_voice_appointment_booking.sql non appliquée."
          : error.message,
      };
    }

    revalidatePath("/app/reglages");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur serveur" };
  }
}

/** Réservé à la plateforme — les artisans ne peuvent pas modifier leur numéro Soline. */
export async function setArtisanVoiceNumber(_phone: string): Promise<VoiceActionResult> {
  return {
    success: false,
    error: "Le numéro Soline est attribué automatiquement. Contactez le support pour toute modification.",
  };
}
