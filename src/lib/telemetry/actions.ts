"use server";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";

/** Présence du jour (1 écriture max / jour / artisan, clé primaire). */
export async function recordDailyPresence(): Promise<void> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return;
  const day = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  await auth.supabase
    .from("artisan_activity_days")
    .upsert({ artisan_id: auth.profileId, day }, { onConflict: "artisan_id,day", ignoreDuplicates: true });
}

/** Rappels opérationnels (devis en attente, renvoi coupé…) : l'artisan peut les couper. */
export async function setOpsNudgesEnabled(enabled: boolean): Promise<{ ok: boolean }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false };
  const { error } = await auth.supabase.from("profiles").update({ ops_nudges_enabled: enabled }).eq("id", auth.profileId);
  return { ok: !error };
}
