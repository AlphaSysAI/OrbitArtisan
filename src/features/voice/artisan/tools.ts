import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bookVoiceAppointment, getVoiceBookingSlots } from "@/lib/appointments/voice-booking";
import { callTimeInfo, resolveCallSession, verifiedCallRequired, type CallSession } from "@/lib/voice/call-session";

type Db = SupabaseClient;

/**
 * Créneaux de visite libres (3 au plus) à proposer à l'appelant,
 * calculés sur les plages de visite de l'artisan (heure de Paris).
 * `call_time` : temps d'appel écoulé / restant (session vérifiée uniquement).
 */
export async function artisanAvailability(db: Db, artisanId: string, body: Record<string, unknown> = {}) {
  const session = await resolveCallSession(db, artisanId, body.conversation_id);
  const result = await getVoiceBookingSlots(
    db,
    artisanId,
    new Date(),
    body,
    session.verified ? session.conversationId : null,
  );
  return withCallTime(db, artisanId, session, result);
}

/**
 * Prise de RDV vocale : RDV `pending` qui bloque le créneau 24 h,
 * validé par l'artisan (SMS de confirmation au client à la validation).
 * Rejeu / déplacement uniquement pour une conversation vérifiée (voice_call_sessions).
 */
export async function artisanScheduleAppointment(
  db: Db,
  artisanId: string,
  input: { body: Record<string, unknown>; callerNumber: string | null; mode: "full" | "message_only" },
) {
  const session = await resolveCallSession(db, artisanId, input.body.conversation_id);
  // Identité incohérente (conversation d'un autre artisan) ou exigée et absente : aucune écriture.
  if (!session.verified && (session.reason === "artisan_mismatch" || verifiedCallRequired())) {
    return {
      ok: false as const,
      error: "unverified_call" as const,
      message: "La réservation n'est pas possible sur cet appel. Rien n'a été réservé : prends un message, l'artisan rappellera.",
    };
  }
  const result = await bookVoiceAppointment(db, artisanId, {
    ...input,
    verifiedConversationId: session.verified ? session.conversationId : null,
  });
  return withCallTime(db, artisanId, session, result);
}

async function withCallTime<T extends object>(db: Db, artisanId: string, session: CallSession, result: T) {
  const callTime = await callTimeInfo(db, artisanId, session).catch(() => null);
  return callTime ? { ...result, call_time: callTime } : result;
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
