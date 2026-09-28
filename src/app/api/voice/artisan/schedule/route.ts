import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { artisanScheduleAppointment } from "@/features/voice/artisan/tools";

/**
 * Tool ElevenLabs « réserver une visite ».
 * Corps : called_number, customer_name, start_time (un des créneaux renvoyés par /availability),
 * customer_phone (défaut : numéro de l'appelant), customer_email (facultatif), address, description.
 */
export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request);
  if (!resolved.ok) return resolved.response;
  const { artisanId, db, body, callerNumber, mode } = resolved.ctx;
  return NextResponse.json(await artisanScheduleAppointment(db, artisanId, { body, callerNumber, mode }));
}
