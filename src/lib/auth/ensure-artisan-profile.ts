import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { isProvisionalSlug, provisionalSlug, slugFromBusinessName } from "@/lib/profile/provisional-slug";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { seedDefaultWorkLibraryForUser } from "@/lib/work-library/actions";

export type EnsureProfileResult = "exists" | "created" | "client" | "referrer" | "failed";

/**
 * Premier passage d'un nouveau compte artisan : crée la fiche `profiles` vide pour que
 * l'onboarding (import de devis, champs manquants) puisse démarrer tout de suite.
 *
 * Un compte qui a déjà une fiche client ou apporteur n'est jamais transformé en artisan.
 * La fiche démarre comme à l'inscription manuelle : abonnement « incomplete » (pas d'essai
 * sans carte), raison sociale vide (donc étape « coordonnées » non validée), slug
 * provisoire aléatoire remplacé à la fin de l'onboarding.
 */
export async function ensureArtisanProfile(supabase: SupabaseClient, user: User): Promise<EnsureProfileResult> {
  const { data: existing } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (existing) return "exists";

  const [{ data: customer }, { data: referrer }] = await Promise.all([
    supabase.from("customer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("business_referrers").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (customer) return "client";
  if (referrer) return "referrer";

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const { error } = await supabase.from("profiles").insert({
    user_id: user.id,
    business_name: "",
    slug: provisionalSlug(),
    subscription_plan: "pro",
    subscription_status: "incomplete",
    trial_ends_at: null,
    registration_ip: typeof meta?.registration_ip === "string" ? meta.registration_ip.slice(0, 45) : null,
    registration_recorded_at: typeof meta?.registration_recorded_at === "string" ? meta.registration_recorded_at : null,
  });
  if (error) {
    // Double onglet / double requête : la fiche vient d'être créée par l'autre.
    if (error.code === "23505") {
      const { data: raced } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
      if (raced) return "exists";
    }
    console.error("[onboarding] création de la fiche artisan", error.code, error.message);
    return "failed";
  }

  await seedDefaultWorkLibraryForUser(user.id);
  return "created";
}

/**
 * Fin d'onboarding : remplace le slug provisoire par un slug lisible tiré de la raison
 * sociale (suffixe -2, -3… si pris). Jamais bloquant : en cas d'échec, le slug provisoire
 * reste valide et l'artisan peut le changer dans Réglages › Activité.
 */
export async function finalizeProvisionalSlug(supabase: SupabaseClient, profileId: string): Promise<void> {
  const { data } = await supabase.from("profiles").select("slug, business_name").eq("id", profileId).maybeSingle();
  if (!data || !isProvisionalSlug(data.slug as string)) return;
  const base = slugFromBusinessName(String(data.business_name ?? ""));
  if (!base) return;

  // Les profils des autres artisans ne sont pas lisibles (RLS) : disponibilité en service role.
  const reader = createSupabaseServiceRoleClient() ?? supabase;
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 56)}-${i}`;
    const { data: taken } = await reader.from("profiles").select("id").eq("slug", candidate).maybeSingle();
    if (taken) continue;
    const { error } = await supabase.from("profiles").update({ slug: candidate }).eq("id", profileId).eq("slug", data.slug as string);
    if (!error) return;
    if (error.code !== "23505") {
      console.error("[onboarding] slug définitif", error.code, error.message);
      return;
    }
  }
}
