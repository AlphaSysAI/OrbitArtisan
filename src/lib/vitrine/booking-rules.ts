import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_VISIT_HOURS,
  hasAnyVisitRange,
  parseVisitHours,
  slotsForParisDay,
  zonedCalendarDay,
  type VisitHours,
} from "@/lib/appointments/visit-hours";
import { loadVitrineBusyIntervals } from "@/lib/vitrine/busy-slots";

/** Plages de l'artisan (réglages), ou plages par défaut s'il n'a rien configuré. */
export async function loadVitrineVisitHours(admin: SupabaseClient, artisanId: string): Promise<VisitHours> {
  const { data } = await admin.from("profiles").select("visit_hours").eq("id", artisanId).maybeSingle();
  const parsed = data?.visit_hours == null ? null : parseVisitHours(data.visit_hours);
  return parsed?.ok && hasAnyVisitRange(parsed.value) ? parsed.value : DEFAULT_VISIT_HOURS;
}

export type VitrineSlotCheck =
  | { ok: true; durationMinutes: number }
  | { ok: false; error: "invalid_slot" | "slot_taken" };

/**
 * Contrôle serveur d'une réservation vitrine : prestation de l'artisan, créneau exactement
 * proposé par le calendrier (plages, pas, délai minimum) et encore libre. Empêche une
 * réservation hors plages envoyée directement à l'API.
 */
export async function checkVitrineSlot(
  admin: SupabaseClient,
  input: { artisanId: string; serviceId: string | null; startIso: string },
  now: Date = new Date(),
): Promise<VitrineSlotCheck> {
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "invalid_slot" };

  let durationMinutes = 60;
  if (input.serviceId) {
    const { data: service } = await admin
      .from("services")
      .select("duration")
      .eq("id", input.serviceId)
      .eq("artisan_id", input.artisanId)
      .maybeSingle();
    if (!service) return { ok: false, error: "invalid_slot" };
    durationMinutes = Number(service.duration ?? 60) || 60;
  }

  const hours = await loadVitrineVisitHours(admin, input.artisanId);
  const day = zonedCalendarDay(start);
  const allowed = slotsForParisDay({ ymd: day, hours, durationMinutes, now });
  if (!allowed.some((s) => s.getTime() === start.getTime())) return { ok: false, error: "invalid_slot" };

  const busy = await loadVitrineBusyIntervals(admin, input.artisanId, now);
  const end = start.getTime() + durationMinutes * 60_000;
  const taken = busy.some((b) => start.getTime() < new Date(b.end).getTime() && end > new Date(b.start).getTime());
  return taken ? { ok: false, error: "slot_taken" } : { ok: true, durationMinutes };
}
