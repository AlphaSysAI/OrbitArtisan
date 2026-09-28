import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { artisanAvailability } from "@/features/voice/artisan/tools";

/** Tool ElevenLabs « disponibilités » : 3 créneaux de visite libres (corps : called_number). */
export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request);
  if (!resolved.ok) return resolved.response;
  const { artisanId, db, mode } = resolved.ctx;
  if (mode !== "full") {
    return NextResponse.json({
      ok: false,
      error: "message_only",
      message: "Soline est en mode message seul ce mois-ci : ne propose pas de rendez-vous, prends un message.",
    });
  }
  return NextResponse.json(await artisanAvailability(db, artisanId));
}
