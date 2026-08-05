import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client admin (service role). Ne jamais importer dans un composant client.
 * Utilisé pour la prise de RDV invité (recherche email auth + file pending).
 */
export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
