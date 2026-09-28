import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";

/**
 * Point d'entrée pour ElevenLabs / Twilio : indique si Soline peut accepter
 * un nouvel appel pour l'artisan rattaché au numéro appelé.
 */
export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request, { withQuota: false });
  if (!resolved.ok) return resolved.response;

  const { artisanId, db } = resolved.ctx;
  const quota = await resolveVoiceQuota(db, artisanId);
  if (!quota) {
    return NextResponse.json({ error: "quota_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    can_accept_calls: true,
    mode: quota.mode,
    is_trial: quota.isTrial,
    included_calls: quota.callsIncluded,
    used_calls: quota.callsUsed,
    remaining_calls: quota.remainingCalls,
    overage_calls: quota.overageCalls,
    period_start: quota.periodStart,
    period_end: quota.periodEnd,
  });
}
