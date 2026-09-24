"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { syncArtisanVoiceNumberMapping } from "@/lib/voice/voice-number-registry";

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

    const admin = createSupabaseServiceRoleClient();
    if (!admin) {
      return { success: false, error: "Registre télécom indisponible (service role)." };
    }

    const sync = await syncArtisanVoiceNumberMapping({
      supabase: admin,
      artisanId: profile.id,
      phoneE164: normalized || null,
      assignedBy: "artisan_self_service",
      releaseReasonWhenCleared: "removed_by_artisan",
    });

    if (!sync.ok) {
      const msg =
        sync.error === "phone_already_assigned"
          ? "Ce numéro est déjà rattaché à un autre artisan."
          : sync.error;
      return { success: false, error: msg };
    }

    revalidatePath("/app/reglages");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur serveur" };
  }
}
