import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Point audit pré-pilote (vague 4, hygiène) : le pattern
 * `auth.getUser()` → `profiles.user_id` était dupliqué fichier par fichier
 * (RDV, devis, factures, appels, chantiers, réglages...) — risque d'oubli à
 * l'ajout d'une route. Centralisé ici en deux étapes composables + un
 * raccourci pour le cas courant.
 */

export type RequireArtisanUserResult =
  | { ok: true; supabase: SupabaseClient; userId: string; userEmail: string | null }
  | { ok: false; error: "auth" };

/** Étape 1 : vérifie la session, sans regarder le profil artisan. */
export async function requireAuthenticatedUser(): Promise<RequireArtisanUserResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  return { ok: true, supabase, userId: user.id, userEmail: user.email ?? null };
}

export type ResolveArtisanProfileResult =
  | { ok: true; profileId: string; profile: Record<string, unknown> }
  | { ok: false; error: "missing_profile" };

/**
 * Étape 2 : résout le profil artisan (`profiles.id`) pour un utilisateur déjà
 * authentifié. `extraColumns` permet de charger d'autres colonnes du profil
 * (ex. `labor_rate_per_hour`, `business_name`, `stripe_account_id`) en plus
 * de `id`, sans dupliquer la requête.
 */
export async function resolveArtisanProfile(
  supabase: SupabaseClient,
  userId: string,
  extraColumns: string[] = [],
): Promise<ResolveArtisanProfileResult> {
  const columns = ["id", ...extraColumns].join(", ");
  const { data } = await supabase
    .from("profiles")
    .select(columns)
    .eq("user_id", userId)
    .maybeSingle();
  const profile = data as Record<string, unknown> | null;

  if (!profile || !profile.id) {
    return { ok: false, error: "missing_profile" };
  }

  return { ok: true, profileId: profile.id as string, profile };
}

export type RequireArtisanProfileResult =
  | { ok: true; supabase: SupabaseClient; userId: string; profileId: string; profile: Record<string, unknown> }
  | { ok: false; error: "auth" | "missing_profile" };

/**
 * Cas courant : authentification + résolution du profil artisan en un appel.
 * Pour un enchaînement avec une étape intermédiaire entre les deux (ex. un
 * contrôle d'abonnement qui a besoin de `userId` avant de charger le
 * profil), composer `requireAuthenticatedUser()` puis `resolveArtisanProfile()`
 * séparément plutôt que d'utiliser ce raccourci.
 */
export async function requireArtisanProfileId(extraColumns: string[] = []): Promise<RequireArtisanProfileResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth;

  const resolved = await resolveArtisanProfile(auth.supabase, auth.userId, extraColumns);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    supabase: auth.supabase,
    userId: auth.userId,
    profileId: resolved.profileId,
    profile: resolved.profile,
  };
}

/**
 * Variante pour les server actions qui redirigent vers la connexion au lieu
 * de renvoyer une erreur typée (comportement identique à ce que chaque
 * fichier faisait déjà individuellement — juste centralisé).
 */
export async function requireArtisanProfileIdOrRedirect(
  extraColumns: string[] = [],
  loginPath = "/login",
): Promise<{ supabase: SupabaseClient; userId: string; profileId: string; profile: Record<string, unknown> }> {
  const result = await requireArtisanProfileId(extraColumns);
  if (!result.ok) redirect(loginPath);
  return result;
}
