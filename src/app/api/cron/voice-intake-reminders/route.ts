import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

import { processVoicePostCallInbox } from "@/lib/voice/voice-post-call-inbox";
import { runVoiceIntakeReminders } from "@/lib/voice/voice-intake-reminders";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Cron Vercel : relances des devis vocaux en attente de validation. Sécurisé par CRON_SECRET. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const [result, replay] = await Promise.all([
    runVoiceIntakeReminders(supabase),
    processVoicePostCallInbox(supabase).catch(() => ({ processed: false })),
  ]);
  return NextResponse.json({ ok: true, ...result, replayed: replay.processed });
}
