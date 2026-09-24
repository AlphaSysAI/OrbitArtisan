"use server";

import { revalidatePath } from "next/cache";

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

export async function setVoiceAllowOverage(allowOverage: boolean): Promise<VoiceActionResult> {
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

    const { error } = await supabase
      .from("profiles")
      .update({ voice_allow_overage: allowOverage })
      .eq("id", profile.id);

    if (error) {
      return {
        success: false,
        error: error.message.includes("voice_allow_overage")
          ? "Migration quota vocal non appliquée (12_voice_quota_civil_month.sql)."
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
