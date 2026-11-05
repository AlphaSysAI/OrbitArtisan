import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Titulaire du compte artisan de l'utilisateur connecté : lui-même, ou le titulaire
 * s'il est collaborateur (formule Ultra). Sert aux tables rattachées au titulaire par
 * `user_id` (bibliothèque d'ouvrages). Repli sur l'utilisateur lui-même.
 */
export async function resolveAccountOwnerUserId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("account_owner_user_id");
  if (error || typeof data !== "string") return userId;
  return data;
}
