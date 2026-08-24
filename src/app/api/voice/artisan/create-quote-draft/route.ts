import { NextResponse } from "next/server";

import { resolveVoiceContext } from "@/features/voice/lib/tool-auth";
import { processVoiceCallQuoteIntake } from "@/lib/voice/process-voice-call-intake";

export async function POST(request: Request) {
  const resolved = await resolveVoiceContext(request);
  if (!resolved.ok) return resolved.response;

  const { artisanId, db, body, callerNumber } = resolved.ctx;
  const calledNumber = String(body.called_number ?? body.to ?? body.phone ?? "").trim();

  const result = await processVoiceCallQuoteIntake({
    db,
    artisanId,
    body,
    callerNumber,
    calledNumber,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    intake_id: result.intakeId,
    summary: result.summary,
    message: result.message,
    preview: {
      customer_name: result.draft.customerName,
      customer_email: result.draft.customerEmail,
      notes: result.draft.notes,
      services_count: result.draft.matchedServiceIds.length,
      materials_count: result.draft.supplierMaterials.length,
    },
  });
}
