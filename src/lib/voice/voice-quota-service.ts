import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";
import { logVoiceQuotaThresholds } from "@/lib/voice/voice-quota-alerts";

export type VoiceQuotaSnapshot = {
  artisanId: string;
  voiceMinutesIncluded: number;
  voiceMinutesUsed: number;
  voiceMinutesOverdue: number;
  remainingMinutes: number;
  hasRemainingMinutes: boolean;
};

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
  voice_minutes_included?: number;
  voice_minutes_used?: number;
  voice_minutes_overdue?: number;
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

export async function checkVoiceQuota(
  db: SupabaseClient,
  artisanId: string,
): Promise<VoiceQuotaSnapshot | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, voice_minutes_included, voice_minutes_used, voice_minutes_overdue")
    .eq("id", artisanId)
    .maybeSingle();

  if (error || !data) {
    console.error("[voice-quota] checkVoiceQuota failed", error?.message ?? "profile missing");
    return null;
  }

  const included = Number(data.voice_minutes_included ?? 0);
  const used = Number(data.voice_minutes_used ?? 0);
  const overdue = Number(data.voice_minutes_overdue ?? 0);
  const remainingMinutes = Math.max(0, included - used);

  return {
    artisanId,
    voiceMinutesIncluded: included,
    voiceMinutesUsed: used,
    voiceMinutesOverdue: overdue,
    remainingMinutes,
    hasRemainingMinutes: remainingMinutes > 0,
  };
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
  const included = Number(payload.voice_minutes_included ?? 0);
  const used = Number(payload.voice_minutes_used ?? 0);
  const overdue = Number(payload.voice_minutes_overdue ?? 0);
  const remainingMinutes = Math.max(0, included - used);

  if (!payload.duplicate && input.minutesBilled > 0) {
    logVoiceQuotaThresholds({
      artisanId: input.artisanId,
      included,
      previousUsed: input.previousUsed ?? Math.max(0, used - input.minutesBilled),
      newUsed: used,
    });
  }

  return {
    ok: true,
    duplicate: Boolean(payload.duplicate),
    minutesBilled: Number(payload.minutes_billed ?? input.minutesBilled),
    quota: {
      artisanId: input.artisanId,
      voiceMinutesIncluded: included,
      voiceMinutesUsed: used,
      voiceMinutesOverdue: overdue,
      remainingMinutes,
      hasRemainingMinutes: remainingMinutes > 0,
    },
  };
}
