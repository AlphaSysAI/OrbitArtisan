import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Artisan = ligne dans `profiles`.
 * Client = `customer_profiles` sans profil artisan (inscription client).
 * Sinon (nouveau compte pro sans fiche encore) → traité comme artisan pour l’accès `/app`.
 */
export async function getAccountType(
  supabase: SupabaseClient,
  userId: string,
): Promise<"artisan" | "client"> {
  const { data: artisan } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (artisan) return "artisan";

  const { data: customer } = await supabase.from("customer_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (customer) return "client";

  return "artisan";
}
