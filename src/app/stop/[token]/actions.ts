"use server";

import { redirect } from "next/navigation";

import { verifyOptOutToken } from "@/lib/concierge/concierge";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/** Opposition RGPD (art. 21) : définitive, sans justification. */
export async function confirmOptOut(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const id = verifyOptOutToken(token);
  const db = createSupabaseServiceRoleClient();
  if (id && db) {
    await db
      .from("prospect_artisans")
      .update({ opt_out: true, status: "blacklisted", notes: null, email: null, latitude: null, longitude: null })
      .eq("id", id);
  }
  redirect(`/stop/${encodeURIComponent(token)}?ok=1`);
}
