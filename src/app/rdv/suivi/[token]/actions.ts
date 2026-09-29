"use server";

import { redirect } from "next/navigation";

import { formatAppointmentWhen, loadCustomerAppointment } from "@/lib/appointments/customer-emails";
import { verifyTrackingToken } from "@/lib/appointments/tracking-link";
import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/** Annulation par le client depuis son lien de suivi (RDV à venir, en attente ou confirmé). */
export async function cancelTrackedAppointment(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const base = `/rdv/suivi/${encodeURIComponent(token)}`;
  const id = verifyTrackingToken(token);
  const db = createSupabaseServiceRoleClient();
  if (!id || !db) redirect(`${base}?etat=erreur`);

  const { data, error } = await db
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["pending", "confirmed"])
    .gt("start_time", new Date().toISOString())
    .select("id, artisan_id");
  if (error || !data?.length) redirect(`${base}?etat=impossible`);

  const appt = await loadCustomerAppointment(db, id);
  const { data: artisan } = await db.from("profiles").select("user_id").eq("id", data[0].artisan_id).maybeSingle();
  if (appt && artisan?.user_id) {
    notifyUserActivity(artisan.user_id as string, {
      title: "RDV annulé par le client",
      body: `${appt.customerName} — ${formatAppointmentWhen(appt.startTime)}. Le créneau est de nouveau libre.`,
      url: `${getPublicSiteUrl()}/app/rdv`,
      tag: `appointment-${id}`,
    });
  }

  redirect(`${base}?etat=annule`);
}
