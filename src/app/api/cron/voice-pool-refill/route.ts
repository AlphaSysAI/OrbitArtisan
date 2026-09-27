import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { refillVoicePoolIfNeeded } from "@/lib/voice/voice-pool-provisioning";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron Vercel : réassort du pool de numéros Soline.
 * Déclenche des ACHATS : CRON_SECRET obligatoire (contrairement aux autres crons,
 * aucune exécution sans secret), et VOICE_POOL_AUTO_REFILL=true requis.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  if (!db) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const result = await refillVoicePoolIfNeeded(db);
  if (result.results.some((r) => !r.ok || r.warning)) {
    console.error("[cron voice-pool-refill]", JSON.stringify(result.results));
  }
  return NextResponse.json({ ok: true, ...result });
}
