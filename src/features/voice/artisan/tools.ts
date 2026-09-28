import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bookVoiceAppointment, getVoiceBookingSlots } from "@/lib/appointments/voice-booking";

type Db = SupabaseClient;

/**
 * Créneaux de visite libres (3 au plus) à proposer à l'appelant,
 * calculés sur les plages de visite de l'artisan (heure de Paris).
 */
export async function artisanAvailability(db: Db, artisanId: string) {
  return getVoiceBookingSlots(db, artisanId);
}

/**
 * Prise de RDV vocale : RDV `pending` qui bloque le créneau 24 h,
 * validé par l'artisan (SMS de confirmation au client à la validation).
 */
export async function artisanScheduleAppointment(
  db: Db,
  artisanId: string,
  input: { body: Record<string, unknown>; callerNumber: string | null; mode: "full" | "message_only" },
) {
  return bookVoiceAppointment(db, artisanId, input);
}

/**
 * Récupère les informations d'un RDV.
 */
export async function artisanAppointmentInfo(
  db: Db,
  artisanId: string,
  body: Record<string, unknown>
) {
  const appointmentId = String(body.appointment_id ?? "").trim();

  if (!appointmentId) {
    return { error: "ID de RDV manquant." };
  }

  try {
    const { data: appointment } = await db
      .from("appointments")
      .select("id, customer_name, customer_email, start_time, status, service_id")
      .eq("id", appointmentId)
      .eq("artisan_id", artisanId)
      .maybeSingle();

    if (!appointment) {
      return { error: "RDV introuvable." };
    }

    return {
      appointment_id: appointment.id,
      customer_name: appointment.customer_name,
      customer_email: appointment.customer_email,
      start_time: appointment.start_time,
      status: appointment.status,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erreur serveur." };
  }
}
