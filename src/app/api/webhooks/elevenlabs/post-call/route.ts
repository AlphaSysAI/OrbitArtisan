import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { parsePostCallTranscription, verifyElevenLabsSignature } from "@/lib/voice/elevenlabs-webhook";
import { processVoiceCallQuoteIntake } from "@/lib/voice/process-voice-call-intake";
import { resolveArtisanIdByCalledNumber } from "@/lib/voice/voice-quota-service";

/**
 * Webhook post-appel ElevenLabs (« post_call_transcription »).
 *
 * Filet de sécurité : chaque appel reçu par Soline finit dans /app/appels, même
 * si l'agent n'a pas appelé l'outil create-quote-draft (oubli, erreur, appelant
 * qui raccroche). Dédoublonné par twilio_call_sid avec l'outil.
 *
 * Répond 200 dès que la signature est valide, y compris en cas d'échec métier
 * (journalisé) : ElevenLabs désactive un webhook qui échoue en boucle.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[elevenlabs post-call] ELEVENLABS_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!verifyElevenLabsSignature({ rawBody, signatureHeader: request.headers.get("elevenlabs-signature"), secret })) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const call = parsePostCallTranscription(payload);
  if (!call) return NextResponse.json({ ignored: true });

  if (!call.calledNumber) {
    // Test depuis l'interface ElevenLabs (pas d'appel téléphonique) : rien à rattacher.
    console.warn("[elevenlabs post-call] numéro appelé absent", { conversationId: call.conversationId });
    return NextResponse.json({ ignored: "no_called_number" });
  }

  const db = createSupabaseServiceRoleClient();
  if (!db) {
    console.error("[elevenlabs post-call] service role indisponible");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const artisanId = await resolveArtisanIdByCalledNumber(db, call.calledNumber);
  if (!artisanId) {
    console.warn("[elevenlabs post-call] numéro non rattaché", { calledNumber: call.calledNumber });
    return NextResponse.json({ ignored: "unknown_number" });
  }

  const result = await processVoiceCallQuoteIntake({
    db,
    artisanId,
    callerNumber: call.callerNumber,
    calledNumber: call.calledNumber,
    skipQuoteDraft: !call.hasCallerSpeech,
    body: {
      transcript: call.hasCallerSpeech
        ? call.transcript
        : "Appel sans message : l'appelant a raccroché ou n'a rien dit. À rappeler si besoin.",
      twilio_call_sid: call.callSid,
      customer_name: call.customerName,
      customer_email: call.customerEmail,
    },
  });

  if ("error" in result) {
    console.error("[elevenlabs post-call] enregistrement de l'appel", {
      conversationId: call.conversationId,
      error: result.error,
    });
    return NextResponse.json({ ok: false, error: result.error });
  }

  return NextResponse.json({ ok: true, intake_id: result.intakeId });
}
