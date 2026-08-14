"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VoiceActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const E164_RE = /^\+[1-9]\d{6,14}$/;

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

export async function setArtisanVoiceNumber(phone: string): Promise<VoiceActionResult> {
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

    const normalized = phone.replace(/[\s.]/g, "");
    if (normalized && !E164_RE.test(normalized)) {
      return { success: false, error: "Numéro invalide (format international, ex. +33123456789)." };
    }

    // Un seul numéro par artisan : on remplace l'existant.
    await supabase.from("artisan_voice_numbers").delete().eq("artisan_id", profile.id);

    if (normalized) {
      const { error } = await supabase.from("artisan_voice_numbers").insert({
        phone_e164: normalized,
        artisan_id: profile.id,
      });
      if (error) {
        const msg = error.message.includes("duplicate")
          ? "Ce numéro est déjà rattaché à un autre artisan."
          : error.message;
        return { success: false, error: msg };
      }
    }
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur serveur" };
  }
}
