"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type ArtisanAppointment = {
  id: string;
  start_time: string;
  status: "pending" | "confirmed" | "cancelled";
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  service_id: string | null;
};

async function requireArtisanProfileId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false as const, error: "missing_profile" as const };

  return { ok: true as const, supabase, userId: user.id, profileId: profile.id };
}

type SetStatusResult = { ok: true } | { ok: false; error: "auth" | "missing_profile" | "not_found" | "update_failed" };

async function setAppointmentStatus(
  appointmentId: string,
  status: "confirmed" | "cancelled",
): Promise<SetStatusResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return auth;
  const { supabase, profileId } = auth;

  // .eq('artisan_id') double la garde RLS : on ne touche qu'à ses propres RDV.
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("artisan_id", profileId)
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  revalidatePath("/app/rdv");
  revalidatePath("/app");
  return { ok: true };
}

export async function confirmAppointment(appointmentId: string) {
  return setAppointmentStatus(appointmentId, "confirmed");
}

export async function cancelAppointment(appointmentId: string) {
  return setAppointmentStatus(appointmentId, "cancelled");
}

export type CreateAppointmentInput = {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  /** Instant absolu calculé côté navigateur (fuseau de l’artisan). */
  startIso: string;
  /** Jour local correspondant (YYYY-MM-DD), pour recentrer le calendrier. */
  dateIso: string;
  serviceId?: string | null;
  status?: "pending" | "confirmed";
};

export type CreateAppointmentResult =
  | { ok: true; id: string; startTime: string; dateIso: string }
  | {
      ok: false;
      error:
        | "auth"
        | "missing_profile"
        | "invalid_name"
        | "invalid_email"
        | "invalid_date"
        | "rls_denied"
        | "insert_failed";
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Création d’un RDV par l’artisan lui-même.
 * Utilise le service role s’il est configuré ; sinon le client authentifié, qui
 * requiert la policy « appointments_owner_insert » (supabase/init.sql).
 */
export async function createArtisanAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return auth;
  const { supabase, profileId } = auth;

  const customerName = input.customerName.trim();
  const customerEmail = input.customerEmail.trim().toLowerCase();
  const customerPhone = input.customerPhone?.trim() || null;

  if (customerName.length < 2) return { ok: false, error: "invalid_name" };
  if (!EMAIL_RE.test(customerEmail)) return { ok: false, error: "invalid_email" };

  const startDate = new Date(input.startIso);
  if (Number.isNaN(startDate.getTime())) return { ok: false, error: "invalid_date" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateIso)) return { ok: false, error: "invalid_date" };

  const admin = createSupabaseServiceRoleClient();
  const db = admin ?? supabase;

  // Rattache le RDV au compte client s’il existe (fiche client, espace /compte).
  // La recherche par e-mail est réservée au service role.
  let customerUserId: string | null = null;
  if (admin) {
    const { data: lookedUp } = await admin.rpc("lookup_auth_user_id_by_email", {
      p_email: customerEmail,
    });
    if (typeof lookedUp === "string") customerUserId = lookedUp;
  }

  const { data, error } = await db
    .from("appointments")
    .insert({
      artisan_id: profileId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_user_id: customerUserId,
      service_id: input.serviceId || null,
      start_time: startDate.toISOString(),
      status: input.status ?? "confirmed",
    })
    .select("id, start_time")
    .single();

  if (error || !data) {
    console.error("[rdv] create", error?.message);
    const denied =
      error?.code === "42501" || /row-level security/i.test(error?.message ?? "");
    return { ok: false, error: denied ? "rls_denied" : "insert_failed" };
  }

  revalidatePath("/app/rdv");
  revalidatePath("/app");

  return {
    ok: true,
    id: data.id as string,
    startTime: data.start_time as string,
    dateIso: input.dateIso,
  };
}
