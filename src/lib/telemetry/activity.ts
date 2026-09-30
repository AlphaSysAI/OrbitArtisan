import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityKind =
  | "onboarding_import"
  | "onboarding_saved"
  | "voice_patch"
  | "intake_validated"
  | "intake_rejected"
  | "quote_sent";

/** Événement métier (non bloquant : un échec de log ne casse jamais l'action). */
export async function logActivity(
  supabase: SupabaseClient,
  artisanId: string,
  kind: ActivityKind,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("artisan_activity_events").insert({ artisan_id: artisanId, kind, meta });
  } catch {
    /* télémétrie best-effort */
  }
}
