import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeVisitSlots,
  formatSlotForSpeech,
  hasAnyVisitRange,
  parseVisitHours,
  pickProposedSlots,
  VISIT_SEARCH_DAYS,
  VISIT_TIMEZONE,
  VOICE_APPOINTMENT_PENDING_TTL_HOURS,
  type VisitHours,
} from "@/lib/appointments/visit-hours";
import { notifyNewAppointment } from "@/lib/notifications/notify-events";
import { sendTransactionalSms } from "@/lib/sms/send-sms";
import { normalizePhoneE164 } from "@/lib/phone";

type Db = SupabaseClient;

type BookingSettings = {
  hours: VisitHours | null;
  durationMinutes: number;
  businessName: string;
};

async function loadBookingSettings(db: Db, artisanId: string): Promise<BookingSettings | null> {
  const { data, error } = await db
    .from("profiles")
    .select("visit_hours, visit_duration_minutes, business_name")
    .eq("id", artisanId)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = data.visit_hours == null ? null : parseVisitHours(data.visit_hours);
  return {
    hours: parsed?.ok && hasAnyVisitRange(parsed.value) ? parsed.value : null,
    durationMinutes: Number(data.visit_duration_minutes ?? 60) || 60,
    businessName: (data.business_name as string | null)?.trim() || "votre artisan",
  };
}

/** Libère les créneaux des RDV pending expirés de l'artisan avant tout calcul. */
async function expirePending(db: Db, artisanId: string | null): Promise<void> {
  const { error } = await db.rpc("expire_pending_appointments", { p_artisan_id: artisanId });
  if (error) console.error("[voice booking] expiration RDV pending", error.message);
}

async function listFreeSlots(db: Db, artisanId: string, settings: BookingSettings & { hours: VisitHours }, now: Date) {
  const horizon = new Date(now.getTime() + (VISIT_SEARCH_DAYS + 1) * 86_400_000);
  const { data: busyRows, error } = await db
    .from("appointments")
    .select("start_time, end_time")
    .eq("artisan_id", artisanId)
    .neq("status", "cancelled")
    .lt("start_time", horizon.toISOString())
    .gt("end_time", now.toISOString());
  if (error) throw new Error(error.message);

  return computeVisitSlots({
    hours: settings.hours,
    durationMinutes: settings.durationMinutes,
    busy: (busyRows ?? []).map((r) => ({
      start: new Date(r.start_time as string),
      end: new Date(r.end_time as string),
    })),
    now,
  });
}

type VoiceSlotsResult =
  | { ok: true; slots: { start_time: string; label: string }[]; duration_minutes: number }
  | { ok: false; error: "booking_not_configured" | "no_slot_available" | "server_error"; message: string };

/** Tool « disponibilités » : 3 créneaux libres à proposer à l'appelant. */
export async function getVoiceBookingSlots(db: Db, artisanId: string, now = new Date()): Promise<VoiceSlotsResult> {
  const settings = await loadBookingSettings(db, artisanId);
  if (!settings?.hours) {
    return {
      ok: false,
      error: "booking_not_configured",
      message:
        "L'artisan n'a pas ouvert de plages de visite. Ne propose pas de rendez-vous : prends les coordonnées et le besoin, l'artisan rappellera.",
    };
  }

  try {
    await expirePending(db, artisanId);
    const free = await listFreeSlots(db, artisanId, { ...settings, hours: settings.hours }, now);
    const proposed = pickProposedSlots(free, 3);
    if (proposed.length === 0) {
      return {
        ok: false,
        error: "no_slot_available",
        message:
          "Aucun créneau de visite libre dans les deux semaines. Prends les coordonnées et le besoin, l'artisan rappellera pour fixer une date.",
      };
    }
    return {
      ok: true,
      duration_minutes: settings.durationMinutes,
      slots: proposed.map((s) => ({ start_time: s.toISOString(), label: formatSlotForSpeech(s) })),
    };
  } catch (error) {
    console.error("[voice booking] disponibilités", error instanceof Error ? error.message : error);
    return { ok: false, error: "server_error", message: "Disponibilités indisponibles. Prends un message." };
  }
}

type VoiceBookResult =
  | { ok: true; appointment_id: string; start_time: string; label: string; message: string }
  | {
      ok: false;
      error:
        | "booking_not_configured"
        | "message_only"
        | "missing_fields"
        | "slot_unavailable"
        | "server_error";
      message: string;
    };

/**
 * Tool « réserver » : crée un RDV `pending` qui bloque le créneau 24 h.
 * Le créneau demandé doit faire partie des créneaux libres recalculés à l'instant
 * (plage de visite, délai minimum, aucun chevauchement) ; la contrainte
 * appointments_no_overlap tranche les réservations simultanées.
 */
export async function bookVoiceAppointment(
  db: Db,
  artisanId: string,
  input: {
    body: Record<string, unknown>;
    callerNumber: string | null;
    mode: "full" | "message_only";
  },
  now = new Date(),
): Promise<VoiceBookResult> {
  if (input.mode !== "full") {
    return {
      ok: false,
      error: "message_only",
      message: "Soline est en mode message seul ce mois-ci : ne fixe pas de rendez-vous, prends un message.",
    };
  }

  const settings = await loadBookingSettings(db, artisanId);
  if (!settings?.hours) {
    return {
      ok: false,
      error: "booking_not_configured",
      message: "L'artisan n'a pas ouvert de plages de visite. Prends un message, il rappellera.",
    };
  }

  const body = input.body;
  const customerName = String(body.customer_name ?? "").trim();
  const startRaw = String(body.start_time ?? "").trim();
  const phoneRaw = String(body.customer_phone ?? input.callerNumber ?? "").trim();
  const customerPhone = phoneRaw ? normalizePhoneE164(phoneRaw) : "";
  const emailRaw = String(body.customer_email ?? "").trim().toLowerCase();
  const customerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  const notes = [String(body.address ?? "").trim(), String(body.description ?? body.notes ?? "").trim()]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 1000);

  const start = new Date(startRaw);
  if (customerName.length < 2 || Number.isNaN(start.getTime()) || !/^\+\d{8,15}$/.test(customerPhone)) {
    return {
      ok: false,
      error: "missing_fields",
      message: "Il faut le nom du client, un numéro de téléphone joignable et un créneau proposé (start_time).",
    };
  }

  try {
    await expirePending(db, artisanId);
    const free = await listFreeSlots(db, artisanId, { ...settings, hours: settings.hours }, now);
    if (!free.some((s) => s.getTime() === start.getTime())) {
      return {
        ok: false,
        error: "slot_unavailable",
        message: "Ce créneau n'est plus libre. Redemande les disponibilités et propose-en un autre.",
      };
    }

    const expiresAt = new Date(now.getTime() + VOICE_APPOINTMENT_PENDING_TTL_HOURS * 3_600_000);
    const { data, error } = await db
      .from("appointments")
      .insert({
        artisan_id: artisanId,
        customer_name: customerName.slice(0, 120),
        customer_email: customerEmail,
        customer_phone: customerPhone,
        start_time: start.toISOString(),
        duration_minutes: settings.durationMinutes,
        status: "pending",
        source: "voice",
        notes: notes || null,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      if (error?.code === "23P01") {
        return {
          ok: false,
          error: "slot_unavailable",
          message: "Ce créneau vient d'être pris. Redemande les disponibilités et propose-en un autre.",
        };
      }
      console.error("[voice booking] insert", error?.message);
      return { ok: false, error: "server_error", message: "Réservation impossible. Prends un message." };
    }

    void notifyNewAppointment(db, {
      artisanId,
      appointmentId: data.id as string,
      customerName,
      startTime: start.toISOString(),
      pendingValidation: true,
    });

    const label = formatSlotForSpeech(start);
    return {
      ok: true,
      appointment_id: data.id as string,
      start_time: start.toISOString(),
      label,
      message: `Créneau réservé, à confirmer par l'artisan : ${label}. Dis au client que le rendez-vous n'est pas encore confirmé et qu'il recevra un SMS dès que l'artisan l'aura validé.`,
    };
  } catch (error) {
    console.error("[voice booking] réservation", error instanceof Error ? error.message : error);
    return { ok: false, error: "server_error", message: "Réservation impossible. Prends un message." };
  }
}

/** SMS de confirmation au client quand l'artisan valide un RDV pris par Soline (une seule fois). */
export async function sendVoiceAppointmentConfirmationSms(db: Db, appointmentId: string): Promise<void> {
  const { data: appt } = await db
    .from("appointments")
    .select("id, artisan_id, source, status, customer_phone, start_time, confirmation_sms_sent_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt || appt.status !== "confirmed" || !appt.customer_phone || appt.confirmation_sms_sent_at) return;
  if (appt.source !== "voice") return;

  const { data: profile } = await db
    .from("profiles")
    .select("business_name, phone")
    .eq("id", appt.artisan_id)
    .maybeSingle();
  const business = (profile?.business_name as string | null)?.trim() || "Votre artisan";
  const when = new Intl.DateTimeFormat("fr-FR", {
    timeZone: VISIT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(appt.start_time as string));
  const contact = (profile?.phone as string | null)?.trim();

  const sms = await sendTransactionalSms({
    to: appt.customer_phone as string,
    body: `${business} confirme votre rendez-vous le ${when}.${contact ? ` Un empêchement ? ${contact}` : ""}`,
  });
  if (!sms.ok) return;

  await db
    .from("appointments")
    .update({ confirmation_sms_sent_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .is("confirmation_sms_sent_at", null);
}

/** Cron : annule les RDV pending expirés, tous artisans confondus. */
export async function expireAllPendingAppointments(db: Db): Promise<number> {
  const { data, error } = await db.rpc("expire_pending_appointments", { p_artisan_id: null });
  if (error) {
    console.error("[voice booking] cron expiration", error.message);
    return 0;
  }
  return Number(data ?? 0);
}
