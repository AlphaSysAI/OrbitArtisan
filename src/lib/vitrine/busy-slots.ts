import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusyInterval } from "@/lib/vitrine/slot-overlap";

/** Horizon affiché par le calendrier de réservation de la vitrine. */
const BUSY_HORIZON_DAYS = 400;

/**
 * Créneaux occupés d'un artisan pour la vitrine publique : uniquement des plages
 * horaires (aucun nom, aucun contact). Lu en service role : les RDV des autres
 * clients ne sont pas lisibles par le visiteur, et ne doivent pas l'être.
 */
export async function loadVitrineBusyIntervals(
  admin: SupabaseClient,
  artisanId: string,
  now: Date = new Date(),
): Promise<BusyInterval[]> {
  const horizon = new Date(now.getTime() + BUSY_HORIZON_DAYS * 86_400_000);
  const { data, error } = await admin
    .from("appointments")
    .select("start_time, end_time")
    .eq("artisan_id", artisanId)
    .neq("status", "cancelled")
    .gt("end_time", now.toISOString())
    .lt("start_time", horizon.toISOString())
    .order("start_time", { ascending: true })
    .limit(1000);

  if (error) {
    console.error("[vitrine] créneaux occupés", artisanId, error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ start: r.start_time as string, end: r.end_time as string }));
}
