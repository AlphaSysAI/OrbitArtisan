import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";

/**
 * Point d'entrée pour ElevenLabs / Twilio : indique si Soline peut accepter
 * un nouvel appel pour l'artisan rattaché au numéro appelé.
 */
export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request, { enforceQuota: false });
  if (!resolved.ok) return resolved.response;

  const { artisanId, db } = resolved.ctx;
  const quota = await resolveVoiceQuota(db, artisanId);
  if (!quota) {
    return NextResponse.json({ error: "quota_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    can_accept_calls: quota.canAcceptCalls,
    allow_overage: quota.allowOverage,
    included_minutes: quota.voiceMinutesIncluded,
    used_minutes: quota.voiceMinutesUsed,
    remaining_minutes: quota.remainingMinutes,
    overdue_minutes: quota.voiceMinutesOverdue,
    period_start: quota.periodStart,
    period_end: quota.periodEnd,
  });
}
