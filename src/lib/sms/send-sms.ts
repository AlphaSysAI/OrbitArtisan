import "server-only";

import twilio from "twilio";

import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";

export type SendSmsResult = { ok: true; sid: string } | { ok: false; error: "not_configured" | "invalid_number" | "send_failed" };

/**
 * Envoi SMS transactionnel via Twilio.
 * Expéditeur : TWILIO_SMS_FROM (numéro SMS Twilio ou identifiant alphanumérique, ex. « Soline »).
 * Sans configuration : aucun envoi, l'appelant continue (le SMS n'est jamais bloquant).
 */
export async function sendTransactionalSms(input: { to: string; body: string }): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim();
  if (!accountSid || !authToken || !from) {
    console.warn("[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM manquant — SMS non envoyé");
    return { ok: false, error: "not_configured" };
  }

  const to = normalizePhoneE164(input.to);
  if (!/^\+\d{8,15}$/.test(to)) return { ok: false, error: "invalid_number" };

  try {
    const message = await twilio(accountSid, authToken).messages.create({ to, from, body: input.body });
    return { ok: true, sid: message.sid };
  } catch (error) {
    console.error("[sms] envoi échoué", error instanceof Error ? error.message : error);
    return { ok: false, error: "send_failed" };
  }
}
