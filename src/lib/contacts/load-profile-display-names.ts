import type { SupabaseClient } from "@supabase/supabase-js";

import { formatContactDisplayName } from "@/lib/contacts/display-name";

/** Charge les noms affichables des profils clients pour une liste de `user_id`. */
export async function loadCustomerDisplayNames(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;

  const { data } = await supabase
    .from("customer_profiles")
    .select("user_id, display_name, email")
    .in("user_id", unique);

  for (const row of data ?? []) {
    map.set(
      row.user_id as string,
      formatContactDisplayName({
        profileName: row.display_name as string | null,
        email: row.email as string | null,
      }),
    );
  }

  return map;
}
