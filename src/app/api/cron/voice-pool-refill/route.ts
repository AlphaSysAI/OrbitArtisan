import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  alertPoolCapacityIfNeeded,
  provisionForWaitingArtisans,
  releaseExpiredQuarantinedNumbers,
} from "@/lib/voice/voice-pool-provisioning";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron Vercel quotidien : restitution des numéros en fin de quarantaine, relance des
 * achats échoués, alerte plafond. Peut déclencher des ACHATS : CRON_SECRET obligatoire
 * (contrairement aux autres crons, aucune exécution sans secret).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  if (!db) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // 1) Fin de quarantaine : numéros rendus à Twilio (jamais réattribués à un autre artisan).
  const released = await releaseExpiredQuarantinedNumbers(db);
  if (released.results.some((r) => !r.ok)) {
    console.error("[cron voice-pool-refill] restitution", JSON.stringify(released.results));
  }

  // 2) Filet de sécurité : abonnés dont l'achat à la demande a échoué (Twilio,
  //    ElevenLabs, plafond relevé depuis). Le cas normal est servi à l'abonnement.
  const retry = await provisionForWaitingArtisans(db);
  if (retry.error) console.error("[cron voice-pool-refill] relance achats", retry.error);

  // 3) Alerte plafond (80 %), après réassort : reflète l'état réel du pool.
  const capacityAlert = await alertPoolCapacityIfNeeded(db).catch(() => false);

  return NextResponse.json({ ok: true, retry, released, capacityAlert });
}
