import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { z } from "zod";

import {
  computeVisitSlots,
  filterSlotsByPreference,
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
import { isMissingSchemaObject } from "@/lib/supabase/schema-compat";

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

/**
 * Créneaux libres. `ownConversationId` : les RDV en attente de CETTE conversation ne bloquent
 * pas le calcul (rejeu ou déplacement de son propre RDV) ; la contrainte
 * appointments_no_overlap reste l'arbitre réel au moment de l'écriture.
 */
async function listFreeSlots(
  db: Db,
  artisanId: string,
  settings: BookingSettings & { hours: VisitHours },
  now: Date,
  ownConversationId: string | null = null,
) {
  const horizon = new Date(now.getTime() + (VISIT_SEARCH_DAYS + 1) * 86_400_000);
  const { data: busyRows, error } = await db
    .from("appointments")
    .select(ownConversationId ? "start_time, end_time, status, voice_conversation_id" : "start_time, end_time")
    .eq("artisan_id", artisanId)
    .neq("status", "cancelled")
    .lt("start_time", horizon.toISOString())
    .gt("end_time", now.toISOString());
  if (error) throw new Error(error.message);

  const rows = (busyRows ?? []) as unknown as {
    start_time: string;
    end_time: string;
    status?: string;
    voice_conversation_id?: string | null;
  }[];
  return computeVisitSlots({
    hours: settings.hours,
    durationMinutes: settings.durationMinutes,
    busy: rows
      .filter((r) => !(ownConversationId && r.voice_conversation_id === ownConversationId && r.status === "pending"))
      .map((r) => ({ start: new Date(r.start_time), end: new Date(r.end_time) })),
    now,
  });
}

/** Paramètres de l'outil « disponibilités » (préférence déjà convertie par l'agent). */
export const VoiceAvailabilityInputSchema = z.object({
  preferred_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  part_of_day: z.enum(["matin", "apres-midi"]).optional().catch(undefined),
});

type VoiceSlotsResult =
  | {
      ok: true;
      slots: { start_time: string; label: string }[];
      duration_minutes: number;
      /** false : aucun créneau pour la préférence demandée, ceux-ci sont les plus proches. */
      matched_preference: boolean;
      timezone: string;
      message?: string;
    }
  | { ok: false; error: "booking_not_configured" | "no_slot_available" | "server_error"; message: string };

/** Tool « disponibilités » : 3 créneaux libres à proposer à l'appelant. */
export async function getVoiceBookingSlots(
  db: Db,
  artisanId: string,
  now = new Date(),
  rawInput: Record<string, unknown> = {},
  /** Conversation vérifiée (voice_call_sessions) : ses propres RDV en attente ne bloquent pas. */
  verifiedConversationId: string | null = null,
): Promise<VoiceSlotsResult> {
  const settings = await loadBookingSettings(db, artisanId);
  if (!settings?.hours) {
    return {
      ok: false,
      error: "booking_not_configured",
      message:
        "L'artisan n'a pas ouvert de plages de visite. Ne propose pas de rendez-vous : prends les coordonnées et le besoin, l'artisan rappellera.",
    };
  }

  const input = VoiceAvailabilityInputSchema.parse(rawInput);
  const preference = { date: input.preferred_date ?? null, partOfDay: input.part_of_day ?? null };
  const hasPreference = Boolean(preference.date || preference.partOfDay);

  try {
    await expirePending(db, artisanId);
    const free = await listFreeSlots(db, artisanId, { ...settings, hours: settings.hours }, now, verifiedConversationId);
    const matching = filterSlotsByPreference(free, preference);
    const matched = !hasPreference || matching.length > 0;
    const proposed = pickProposedSlots(matched ? matching : free, 3);
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
      matched_preference: matched,
      timezone: VISIT_TIMEZONE,
      slots: proposed.map((s) => ({ start_time: s.toISOString(), label: formatSlotForSpeech(s) })),
      ...(matched
        ? {}
        : {
            message:
              "Aucun créneau libre pour la préférence demandée. Dis-le au client puis propose ces créneaux les plus proches.",
          }),
    };
  } catch (error) {
    console.error("[voice booking] disponibilités", error instanceof Error ? error.message : error);
    return { ok: false, error: "server_error", message: "Disponibilités indisponibles. Prends un message." };
  }
}

/** Paramètres de l'outil « réserver » : validés côté serveur, jamais pris tels quels du modèle. */
export const VoiceScheduleInputSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  start_time: z.string().trim().min(10),
  customer_phone: z.string().trim().max(40).optional(),
  customer_email: z.string().trim().max(254).optional(),
  address: z.string().trim().max(300).optional(),
  description: z.string().trim().max(700).optional(),
  notes: z.string().trim().max(700).optional(),
  /** appointment_id renvoyé plus tôt dans CET appel : le client déplace ce RDV. */
  replaces_appointment_id: z.string().trim().uuid().optional().catch(undefined),
  /** true : seconde visite pour un autre besoin, dans le même appel. */
  additional_visit: z
    .enum(["true", "false"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "true"),
});

type VoiceBookError =
  | "booking_not_configured"
  | "message_only"
  | "missing_fields"
  | "slot_unavailable"
  | "existing_booking"
  | "replace_not_found"
  | "appointment_locked"
  | "change_unavailable"
  | "server_error";

export type VoiceBookResult =
  | {
      ok: true;
      appointment_id: string;
      start_time: string;
      label: string;
      /** Statut réel : jamais « confirmé » tant que l'artisan n'a pas validé. */
      status: "pending_validation";
      /** true : même opération déjà enregistrée (rejeu après timeout), rien de nouveau créé. */
      already_booked?: boolean;
      /** Le RDV de cet appel a été déplacé (même appointment_id) ; ancien libellé. */
      previous_label?: string;
      message: string;
    }
  | { ok: false; error: VoiceBookError; message: string; appointment_id?: string };

function bookedMessage(label: string): string {
  return `Créneau réservé, à confirmer par l'artisan : ${label}. Dis au client que le rendez-vous n'est pas encore confirmé et qu'il recevra un SMS dès que l'artisan l'aura validé.`;
}

const SLOT_TAKEN_MESSAGE = "Ce créneau n'est plus libre. Redemande les disponibilités et propose-en un autre.";
const SERVER_ERROR: VoiceBookResult = {
  ok: false,
  error: "server_error",
  message: "La réservation n'a pas abouti. Ne dis pas qu'un rendez-vous est pris : prends un message, l'artisan rappellera.",
};

type RpcBooking = {
  status:
    | "created"
    | "already_booked"
    | "replaced"
    | "existing_booking"
    | "replace_not_found"
    | "replace_not_pending"
    | "slot_unavailable";
  id?: string;
  start_time?: string;
  previous_start_time?: string;
};

/**
 * Tool « réserver » : crée (ou déplace) un RDV `pending` qui bloque le créneau 24 h.
 *
 * Identité d'une opération = artisan (numéro appelé) + conversation ElevenLabs vérifiée
 * (voice_call_sessions) + créneau. L'arbitrage se fait en base, dans une seule transaction
 * (voice_book_appointment, migration 63) :
 * - rejeu (même conversation, même créneau) → la réservation existante est renvoyée ;
 * - modification → seulement le RDV en attente désigné, de CETTE conversation ; s'il est
 *   déjà validé, ou si le nouveau créneau est pris, rien ne change ;
 * - nouvelle réservation alors que la conversation a déjà un RDV en attente → refusée tant
 *   que l'agent n'a pas précisé « déplacer » ou « visite supplémentaire ».
 * Sans conversation vérifiable (outil non configuré, migration absente) : création simple,
 * jamais de modification ni d'annulation.
 */
export async function bookVoiceAppointment(
  db: Db,
  artisanId: string,
  input: {
    body: Record<string, unknown>;
    callerNumber: string | null;
    mode: "full" | "message_only";
    /** conversation_id vérifié pour cet artisan, ou null. */
    verifiedConversationId?: string | null;
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

  const parsed = VoiceScheduleInputSchema.safeParse(
    Object.fromEntries(
      Object.entries(input.body).map(([k, v]) => [k, typeof v === "string" ? v : v == null ? undefined : String(v)]),
    ),
  );
  const fields = parsed.success ? parsed.data : null;
  const phoneRaw = (fields?.customer_phone || input.callerNumber || "").trim();
  const customerPhone = phoneRaw ? normalizePhoneE164(phoneRaw) : "";
  const start = new Date(fields?.start_time ?? "");
  if (!fields || Number.isNaN(start.getTime()) || !customerPhone || !/^\+\d{8,15}$/.test(customerPhone)) {
    return {
      ok: false,
      error: "missing_fields",
      message: "Il faut le nom du client, un numéro de téléphone joignable et un créneau proposé (start_time).",
    };
  }

  const conversationId = input.verifiedConversationId ?? null;
  if (fields.replaces_appointment_id && !conversationId) {
    return {
      ok: false,
      error: "change_unavailable",
      message:
        "Le rendez-vous ne peut pas être déplacé pendant l'appel. Rien n'a été modifié : note le créneau souhaité dans le message, l'artisan ajustera.",
    };
  }

  const customerName = fields.customer_name;
  const emailRaw = (fields.customer_email ?? "").toLowerCase();
  const customerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  const notes = [fields.address ?? "", fields.description ?? fields.notes ?? ""].filter(Boolean).join(" — ").slice(0, 1000);
  const expiresAt = new Date(now.getTime() + VOICE_APPOINTMENT_PENDING_TTL_HOURS * 3_600_000);

  try {
    await expirePending(db, artisanId);

    // Précondition métier (plages de visite, horizon) : le créneau doit être un créneau proposable.
    const free = await listFreeSlots(db, artisanId, { ...settings, hours: settings.hours }, now, conversationId);
    if (!free.some((s) => s.getTime() === start.getTime())) {
      return { ok: false, error: "slot_unavailable", message: SLOT_TAKEN_MESSAGE };
    }

    if (conversationId) {
      const { data, error } = await db.rpc("voice_book_appointment", {
        p_artisan_id: artisanId,
        p_conversation_id: conversationId,
        p_start: start.toISOString(),
        p_duration_minutes: settings.durationMinutes,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_notes: notes || null,
        p_expires_at: expiresAt.toISOString(),
        p_replaces_id: fields.replaces_appointment_id ?? null,
        p_additional: fields.additional_visit,
      });
      if (!error) {
        return interpretBooking(db, artisanId, data as RpcBooking, { start, customerName, replacing: Boolean(fields.replaces_appointment_id) });
      }
      if (!isMissingSchemaObject(error, "voice_book_appointment")) {
        console.error("[voice booking] rpc", error.code, error.message);
        return SERVER_ERROR;
      }
      console.warn("[voice booking] voice_book_appointment absente (migration 63) : création simple");
      if (fields.replaces_appointment_id) {
        return {
          ok: false,
          error: "change_unavailable",
          message:
            "Le rendez-vous ne peut pas être déplacé pendant l'appel. Rien n'a été modifié : note le créneau souhaité dans le message, l'artisan ajustera.",
        };
      }
    }

    // Mode sans identité vérifiable : insertion simple, aucune modification d'un RDV existant.
    const { data, error } = await db
      .from("appointments")
      .insert({
        artisan_id: artisanId,
        customer_name: customerName,
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
        return { ok: false, error: "slot_unavailable", message: SLOT_TAKEN_MESSAGE };
      }
      console.error("[voice booking] insert", error?.code, error?.message);
      return SERVER_ERROR;
    }
    return interpretBooking(db, artisanId, { status: "created", id: data.id as string }, { start, customerName, replacing: false });
  } catch (error) {
    console.error("[voice booking] réservation", error instanceof Error ? error.message : error);
    return SERVER_ERROR;
  }
}

function interpretBooking(
  db: Db,
  artisanId: string,
  result: RpcBooking,
  ctx: { start: Date; customerName: string; replacing: boolean },
): VoiceBookResult {
  const label = formatSlotForSpeech(ctx.start);
  const notify = (appointmentId: string) =>
    void notifyNewAppointment(db, {
      artisanId,
      appointmentId,
      customerName: ctx.customerName,
      startTime: ctx.start.toISOString(),
      pendingValidation: true,
    });

  switch (result?.status) {
    case "created":
    case "replaced":
    case "already_booked": {
      if (!result.id) break;
      if (result.status !== "already_booked") notify(result.id);
      const previousLabel =
        result.status === "replaced" && result.previous_start_time
          ? formatSlotForSpeech(new Date(result.previous_start_time))
          : undefined;
      return {
        ok: true,
        appointment_id: result.id,
        start_time: ctx.start.toISOString(),
        label,
        status: "pending_validation",
        ...(result.status === "already_booked" ? { already_booked: true } : {}),
        ...(previousLabel ? { previous_label: previousLabel } : {}),
        message: previousLabel
          ? `${bookedMessage(label)} Le créneau précédent (${previousLabel}) est libéré.`
          : bookedMessage(label),
      };
    }
    case "existing_booking": {
      const existing = result.start_time ? formatSlotForSpeech(new Date(result.start_time)) : "un autre créneau";
      return {
        ok: false,
        error: "existing_booking",
        appointment_id: result.id,
        message: `Rien n'a été réservé : un rendez-vous est déjà en attente pendant cet appel (${existing}). Demande au client s'il veut le déplacer (rappelle schedule avec replaces_appointment_id = ${result.id ?? "son identifiant"}) ou s'il s'agit d'une seconde visite pour un autre besoin (additional_visit = true).`,
      };
    }
    case "replace_not_found":
      return {
        ok: false,
        error: "replace_not_found",
        message: "Ce rendez-vous n'a pas été pris pendant cet appel : il n'est pas modifié. Prends un message, l'artisan rappellera.",
      };
    case "replace_not_pending":
      return {
        ok: false,
        error: "appointment_locked",
        message: "Ce rendez-vous a déjà été traité par l'artisan : il n'est pas modifié. Prends un message, l'artisan rappellera.",
      };
    case "slot_unavailable":
      return {
        ok: false,
        error: "slot_unavailable",
        message: ctx.replacing
          ? `${SLOT_TAKEN_MESSAGE} Le rendez-vous déjà réservé est conservé.`
          : SLOT_TAKEN_MESSAGE,
      };
  }
  console.error("[voice booking] réponse inattendue", result);
  return SERVER_ERROR;
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
