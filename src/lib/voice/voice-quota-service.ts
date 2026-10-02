import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyVoiceQuotaThreshold } from "@/lib/notifications/notify-events";
import { detectVoiceQuotaThreshold } from "@/lib/voice/voice-quota-alerts";

import { isBillableCall, resolveVoiceQuota, type VoiceQuotaSnapshot } from "./resolve-voice-quota";
import { normalizePhoneE164 } from "@/lib/phone";


type ProcessTwilioCallResult =
  | {
      ok: true;
      duplicate: boolean;
      billable: boolean;
      quota: VoiceQuotaSnapshot;
    }
  | { ok: false; code: "artisan_not_found" | "rpc_failed"; message: string };

type RpcProcessResult = {
  duplicate?: boolean;
  minutes_billed?: number;
  log_id?: string | null;
};

export async function resolveArtisanIdByCalledNumber(
  db: SupabaseClient,
  calledNumber: string,
): Promise<string | null> {
  const normalized = normalizePhoneE164(calledNumber);
  if (!normalized) return null;

  const { data, error } = await db
    .from("artisan_voice_numbers")
    .select("artisan_id, is_active")
    .eq("phone_e164", normalized)
    .maybeSingle();

  if (error) {
    console.error("[voice-quota] lookup artisan_voice_numbers failed", error.message);
    return null;
  }

  if (!data?.artisan_id || !data.is_active) return null;
  return data.artisan_id as string;
}

/**
 * Journalise un statusCallback Twilio (idempotent) puis alerte l'artisan
 * aux seuils 80 % / 100 % de ses appels inclus.
 * `minutesBilled` est conservé pour le suivi du coût de revient (Twilio/ElevenLabs).
 */
export async function processTwilioCallStatus(
  db: SupabaseClient,
  input: {
    artisanId: string;
    twilioCallSid: string;
    fromNumber: string;
    toNumber: string;
    status: string;
    durationSeconds: number;
    minutesBilled: number;
  },
): Promise<ProcessTwilioCallResult> {
  const { data, error } = await db.rpc("process_twilio_voice_call_status", {
    p_artisan_id: input.artisanId,
    p_twilio_call_sid: input.twilioCallSid,
    p_from_number: input.fromNumber,
    p_to_number: input.toNumber,
    p_status: input.status,
    p_duration_seconds: input.durationSeconds,
    p_minutes_billed: input.minutesBilled,
  });

  if (error) {
    console.error("[voice-quota] RPC process_twilio_voice_call_status failed", error.message);
    return { ok: false, code: "rpc_failed", message: error.message };
  }

  const payload = (data ?? {}) as RpcProcessResult;
  const duplicate = Boolean(payload.duplicate);
  const billable = !duplicate && isBillableCall(input.status, input.durationSeconds);

  const quota = await resolveVoiceQuota(db, input.artisanId);
  if (!quota) {
    return { ok: false, code: "artisan_not_found", message: "profile missing" };
  }

  if (billable) {
    const threshold = detectVoiceQuotaThreshold({
      included: quota.callsIncluded,
      previousUsed: quota.callsUsed - 1,
      newUsed: quota.callsUsed,
    });
    if (threshold) {
      void notifyVoiceQuotaThreshold(db, {
        artisanId: input.artisanId,
        threshold,
        callsIncluded: quota.callsIncluded,
        isTrial: quota.isTrial,
        overageCallCents: quota.overageCallCents,
        overageCapCents: quota.overageCapCents,
      });
    }
  }

  return { ok: true, duplicate, billable, quota };
}
