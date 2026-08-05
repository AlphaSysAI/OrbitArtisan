import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { artisanAppointmentInfo } from "@/features/voice/artisan/tools";

export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request);
  if (!resolved.ok) return resolved.response;
  const { artisanId, db, body } = resolved.ctx;
  return NextResponse.json(await artisanAppointmentInfo(db, artisanId, body));
}
