import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyVoiceQuotaExhausted } from "@/lib/notifications/notify-events";
import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";
import { logVoiceQuotaThresholds } from "@/lib/voice/voice-quota-alerts";

import { resolveVoiceQuota, type VoiceQuotaSnapshot } from "./resolve-voice-quota";

export type { VoiceQuotaSnapshot };

export type ProcessTwilioCallResult =
  | {
      ok: true;
      duplicate: boolean;
      minutesBilled: number;
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

/** Alias historique — dérive le quota depuis voice_call_logs (mois civil). */
export async function checkVoiceQuota(
  db: SupabaseClient,
  artisanId: string,
): Promise<VoiceQuotaSnapshot | null> {
  return resolveVoiceQuota(db, artisanId);
}

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
    previousUsed?: number;
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
  const minutesBilled = duplicate ? 0 : Number(payload.minutes_billed ?? input.minutesBilled);

  const quota = await resolveVoiceQuota(db, input.artisanId);
  if (!quota) {
    return { ok: false, code: "artisan_not_found", message: "profile missing" };
  }

  if (!duplicate && minutesBilled > 0) {
    const crossed = logVoiceQuotaThresholds({
      artisanId: input.artisanId,
      included: quota.voiceMinutesIncluded,
      previousUsed: input.previousUsed ?? Math.max(0, quota.voiceMinutesUsed - minutesBilled),
      newUsed: quota.voiceMinutesUsed,
    });
    if (crossed === "100") {
      void notifyVoiceQuotaExhausted(db, {
        artisanId: input.artisanId,
        voiceMinutesIncluded: quota.voiceMinutesIncluded,
      });
    }
  }

  return {
    ok: true,
    duplicate,
    minutesBilled,
    quota,
  };
}
