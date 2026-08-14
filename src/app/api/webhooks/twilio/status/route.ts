import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeTwilioMinutesBilled, parseTwilioFormBody } from "@/lib/voice/twilio-minutes";
import { resolveTwilioWebhookUrl, validateTwilioRequestSignature } from "@/lib/voice/twilio-signature";
import {
  checkVoiceQuota,
  processTwilioCallStatus,
  resolveArtisanIdByCalledNumber,
} from "@/lib/voice/voice-quota-service";

export const runtime = "nodejs";

const EMPTY_TWIML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    console.error("[twilio/status] TWILIO_AUTH_TOKEN manquant");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const params = parseTwilioFormBody(rawBody);
  const signature = request.headers.get("X-Twilio-Signature");
  const webhookUrl = resolveTwilioWebhookUrl(request);

  if (!validateTwilioRequestSignature(authToken, signature, webhookUrl, params)) {
    console.warn("[twilio/status] Signature Twilio invalide", { webhookUrl });
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const callSid = params.CallSid?.trim();
  const callStatus = params.CallStatus?.trim() ?? "";
  const callDuration = params.CallDuration ?? "0";
  const fromNumber = params.From?.trim() ?? "";
  const toNumber = params.To?.trim() ?? "";

  if (!callSid) {
    return NextResponse.json({ error: "missing_call_sid" }, { status: 400 });
  }

  if (!toNumber) {
    return NextResponse.json({ error: "missing_to_number" }, { status: 400 });
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error("[twilio/status] client admin indisponible", error);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const artisanId = await resolveArtisanIdByCalledNumber(admin, toNumber);
  if (!artisanId) {
    console.warn("[twilio/status] artisan introuvable pour le numéro appelé", { toNumber, callSid });
    return new NextResponse(EMPTY_TWIML, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const durationSeconds = Number(callDuration);
  const safeDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
  const minutesBilled = computeTwilioMinutesBilled(callStatus, safeDurationSeconds);

  const quotaBefore = await checkVoiceQuota(admin, artisanId);
  const previousUsed = quotaBefore?.voiceMinutesUsed ?? 0;

  const result = await processTwilioCallStatus(admin, {
    artisanId,
    twilioCallSid: callSid,
    fromNumber,
    toNumber,
    status: callStatus,
    durationSeconds: safeDurationSeconds,
    minutesBilled,
    previousUsed,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 500 });
  }

  if (result.duplicate) {
    console.info("[twilio/status] Appel déjà traité (idempotent)", { callSid, artisanId });
  } else {
    console.info("[twilio/status] Appel enregistré", {
      callSid,
      artisanId,
      callStatus,
      durationSeconds: safeDurationSeconds,
      minutesBilled: result.minutesBilled,
      used: result.quota.voiceMinutesUsed,
      included: result.quota.voiceMinutesIncluded,
      overdue: result.quota.voiceMinutesOverdue,
    });
  }

  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
