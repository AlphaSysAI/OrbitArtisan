import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPostCall } from "./elevenlabs-webhook";
import { processVoiceCallQuoteIntake } from "./process-voice-call-intake";
import { endCallSession } from "./call-session";

type InboxEvent = { id: string; artisan_id: string; claimed_at: string; payload: ParsedPostCall };

export async function enqueueVoicePostCall(db: SupabaseClient, artisanId: string, call: ParsedPostCall) {
  const id = call.conversationId ? `conversation:${call.conversationId}` : call.callSid ? `twilio:${call.callSid}` : null;
  if (!id || !call.calledNumber) return null;
  const { error } = await db.from("voice_post_call_inbox").upsert({
    id, artisan_id: artisanId, payload: { ...call, transcript: call.transcript.slice(0, 24000) },
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("voice_post_call_persist_failed");
  return id;
}

/** Traitement métier d'un post-appel (enregistrement dans /app/appels, fin de session). */
export async function recordVoicePostCall(db: SupabaseClient, artisanId: string, call: ParsedPostCall) {
  if (!call.calledNumber) throw new Error("missing_called_number");
  const result = await processVoiceCallQuoteIntake({
    db, artisanId, callerNumber: call.callerNumber, calledNumber: call.calledNumber,
    skipQuoteDraft: !call.hasCallerSpeech, conversationId: call.conversationId,
    agentPromptVersion: call.agentPromptVersion, callDurationSecs: call.callDurationSecs,
    body: {
      transcript: call.hasCallerSpeech ? call.transcript : "Appel sans message.",
      twilio_call_sid: call.callSid, customer_name: call.customerName, customer_email: call.customerEmail,
    },
  });
  if ("error" in result) throw new Error("voice_intake_failed");
  await endCallSession(db, call.conversationId);
  return result;
}

export async function processVoicePostCallInbox(db: SupabaseClient, id?: string) {
  const { data, error } = await db.rpc("claim_voice_post_call", { p_id: id ?? null });
  if (error) throw new Error("voice_post_call_claim_failed");
  const event = (data as InboxEvent[] | null)?.[0];
  if (!event) return { processed: false };
  const call = event.payload;
  try {
    const result = await recordVoicePostCall(db, event.artisan_id, call);
    const saved = await db.from("voice_post_call_inbox")
      .update({ processed_at: new Date().toISOString(), payload: null, claimed_at: null })
      .eq("id", event.id).eq("claimed_at", event.claimed_at);
    if (saved.error) throw new Error("voice_post_call_ack_failed");
    return { processed: true, intakeId: result.intakeId };
  } catch {
    await db.from("voice_post_call_inbox")
      .update({ claimed_at: null, next_attempt_at: new Date(Date.now() + 300000).toISOString() })
      .eq("id", event.id).eq("claimed_at", event.claimed_at);
    console.error("[voice-post-call] reprise nécessaire", { eventId: event.id });
    return { processed: false };
  }
}
