import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Perf (refacto latence, point 1) : sur une navigation `/app`, layout,
 * bandeau d'abonnement, gate vocale et page appelaient chacun
 * `auth.getUser()` (aller-retour réseau vers Supabase Auth) + relisaient
 * `profiles`. `React.cache` mémoïse pour la durée d'UNE requête serveur :
 * aucun partage entre requêtes, donc aucun risque de fuite inter-tenant.
 *
 * Hors rendu RSC (route handlers), `cache` est un simple passe-plat :
 * comportement identique à l'existant, sans déduplication.
 */

/** Client Supabase (session cookies) partagé pour la requête en cours. */
export const getRequestSupabase = cache(createSupabaseServerClient);

/** Utilisateur authentifié (validé côté Supabase Auth), une fois par requête. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await getRequestSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Flag Super Admin plateforme, une fois par requête et par userId. */
export const getIsPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  const supabase = await getRequestSupabase();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.user_id;
});
