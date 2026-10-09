import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { artisanAvailability } from "@/features/voice/artisan/tools";

/**
 * Tool ElevenLabs « disponibilités » : 3 créneaux de visite libres.
 * Corps : called_number, conversation_id (= {{system__conversation_id}}, rempli par la plateforme),
 * preferred_date (AAAA-MM-JJ, facultatif), part_of_day (matin | apres-midi, facultatif).
 */
export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request);
  if (!resolved.ok) return resolved.response;
  const { artisanId, db, mode, body } = resolved.ctx;
  if (mode !== "full") {
    return NextResponse.json({
      ok: false,
      error: "message_only",
      message: "Soline est en mode message seul ce mois-ci : ne propose pas de rendez-vous, prends un message.",
    });
  }
  return NextResponse.json(await artisanAvailability(db, artisanId, body));
}
