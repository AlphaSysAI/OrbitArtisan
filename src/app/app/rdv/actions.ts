"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
