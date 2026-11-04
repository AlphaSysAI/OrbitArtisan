import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { parsePostCallTranscription, verifyElevenLabsSignature } from "@/lib/voice/elevenlabs-webhook";
import { enqueueVoicePostCall, processVoicePostCallInbox, recordVoicePostCall } from "@/lib/voice/voice-post-call-inbox";
import { resolveArtisanIdByCalledNumber } from "@/lib/voice/voice-quota-service";

/**
 * Persiste un événement signé avant de tenter son traitement.
 *
 * Répond toujours 200 une fois la signature validée : ElevenLabs désactive un
 * webhook qui échoue en boucle. Si l'événement ne peut pas être mis en file
 * (base indisponible, appel sans identifiant), on tente un traitement direct
 * et on journalise l'échec pour reprise manuelle.
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

  let eventId: string | null = null;
  try {
    eventId = await enqueueVoicePostCall(db, artisanId, call);
  } catch (error) {
    console.error("[elevenlabs post-call] mise en file impossible", { conversationId: call.conversationId, error });
  }

  if (!eventId) {
    // Pas de reprise automatique possible : traitement direct, sans renvoyer d'erreur au fournisseur.
    try {
      const result = await recordVoicePostCall(db, artisanId, call);
      return NextResponse.json({ ok: true, processed: true, intakeId: result.intakeId, queued: false });
    } catch (error) {
      console.error("[elevenlabs post-call] appel non enregistré — reprise manuelle nécessaire", {
        conversationId: call.conversationId,
        callSid: call.callSid,
        error,
      });
      return NextResponse.json({ ok: false, processed: false, queued: false });
    }
  }

  const result = await processVoicePostCallInbox(db, eventId).catch(() => ({ processed: false }));
  return NextResponse.json({ ok: true, ...result });
}
