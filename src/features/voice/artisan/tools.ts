import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

/**
 * Récupère les créneaux disponibles pour un artisan sur une période donnée.
 */
export async function artisanAvailability(
  db: Db,
  artisanId: string,
  body: Record<string, unknown>
) {
  const startDate = String(body.start_date ?? "").trim();
  const endDate = String(body.end_date ?? "").trim();

  if (!startDate || !endDate) {
    return { error: "Dates manquantes (start_date, end_date au format AAAA-MM-JJ)." };
  }

  try {
    // Vérifier que l'artisan existe
    const { data: profile } = await db
      .from("profiles")
      .select("id, business_name")
      .eq("id", artisanId)
      .maybeSingle();

    if (!profile) {
      return { error: "Artisan introuvable." };
    }

    // Récupérer les RDV existants sur la période
    const { data: appointments } = await db
      .from("appointments")
      .select("start_time, service_id")
      .eq("artisan_id", artisanId)
      .gte("start_time", `${startDate}T00:00:00Z`)
      .lt("start_time", `${endDate}T23:59:59Z`)
      .eq("status", "confirmed");

    // Récupérer les services pour connaître leur durée
    const { data: services } = await db
      .from("services")
      .select("id, title, duration")
      .eq("artisan_id", artisanId);

    const serviceMap = new Map(
      (services ?? []).map((s) => [s.id, { title: s.title, duration: s.duration }])
    );

    // Créer des slots de 1h : 9h-12h et 14h-18h (jours ouvrables)
    const slots = [];
    const current = new Date(`${startDate}T09:00:00Z`);
    const end = new Date(`${endDate}T23:59:59Z`);

    while (current < end) {
      const dayOfWeek = current.getUTCDay();
      const hour = current.getUTCHours();

      // Lundi-Vendredi, 9h-12h et 14h-18h
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18))) {
        const slotStart = current.toISOString();
        const slotEnd = new Date(current.getTime() + 60 * 60 * 1000).toISOString();

        // Vérifier si le créneau est libre
        const isBooked = (appointments ?? []).some((apt) => {
          const aptStart = new Date(apt.start_time as string).getTime();
          const serviceId = apt.service_id as string;
          const service = serviceMap.get(serviceId);
          const duration = service?.duration ?? 60;
          const aptEnd = aptStart + duration * 60 * 1000;
          const slotStartTime = new Date(slotStart).getTime();
          const slotEndTime = new Date(slotEnd).getTime();

          return slotStartTime < aptEnd && slotEndTime > aptStart;
        });

        if (!isBooked) {
          slots.push({ time: slotStart, status: "available" });
        }
      }

      current.setUTCHours(current.getUTCHours() + 1);
    }

    return {
      business_name: profile.business_name,
      start_date: startDate,
      end_date: endDate,
      available_slots: slots.slice(0, 10), // Limiter à 10 créneaux
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erreur lors de la récupération de la disponibilité." };
  }
}

/**
 * Crée un RDV pour l'artisan (en statut "pending").
 */
export async function artisanScheduleAppointment(
  db: Db,
  artisanId: string,
  body: Record<string, unknown>
) {
  const customerName = String(body.customer_name ?? "").trim();
  const customerEmail = String(body.customer_email ?? "").trim();
  const startTime = String(body.start_time ?? "").trim();
  const serviceId = body.service_id ? String(body.service_id).trim() : null;

  if (!customerName || !customerEmail || !startTime) {
    return { error: "Champs manquants (customer_name, customer_email, start_time)." };
  }

  try {
    const { data: appointment, error } = await db.from("appointments").insert({
      artisan_id: artisanId,
      customer_name: customerName,
      customer_email: customerEmail,
      service_id: serviceId,
      start_time: startTime,
      status: "pending",
    } as any).select().single();

    if (error) {
      return { error: error.message || "Erreur lors de la création du RDV." };
    }

    return {
      ok: true,
      appointment_id: appointment?.id,
      message: `RDV créé pour ${customerName} le ${new Date(startTime).toLocaleDateString("fr-FR")}.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erreur serveur." };
  }
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
