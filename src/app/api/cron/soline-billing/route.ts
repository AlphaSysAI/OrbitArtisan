import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

import { expireAllPendingAppointments } from "@/lib/appointments/voice-booking";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { purgeStaleCallSessions } from "@/lib/voice/call-session";
import { billPreviousMonthVoiceOverage, releaseExpiredTrialVoiceNumbers } from "@/lib/voice/voice-overage-billing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien Soline (sécurisé par CRON_SECRET) :
 * - annule les RDV pris par Soline non validés sous 24 h (libère le créneau) ;
 * - purge les sessions d'appel orphelines (post-appel jamais reçu) ;
 * - rend les numéros des essais expirés (quarantaine 30 j) ;
 * - facture le dépassement d'appels du mois précédent (idempotent : ne facture qu'une fois).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const expiredAppointments = await expireAllPendingAppointments(supabase);
  await purgeStaleCallSessions(supabase);
  const releasedTrialNumbers = await releaseExpiredTrialVoiceNumbers(supabase);
  const overage = await billPreviousMonthVoiceOverage(supabase);

  return NextResponse.json({ ok: true, expiredAppointments, releasedTrialNumbers, overage });
}
