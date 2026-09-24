import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Recopie l'IP d'inscription (metadata Supabase Auth) vers profiles si encore vide. */
export async function persistRegistrationIpOnProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const registrationIp =
    typeof meta?.registration_ip === "string" ? meta.registration_ip.slice(0, 45) : null;
  const registrationRecordedAt =
    typeof meta?.registration_recorded_at === "string" ? meta.registration_recorded_at : null;

  if (!registrationIp && !registrationRecordedAt) return;

  await supabase
    .from("profiles")
    .update({
      registration_ip: registrationIp,
      registration_recorded_at: registrationRecordedAt ?? new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .is("registration_ip", null);
}
