import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type VoiceNumberPoolRow = {
  id: string;
  phone_e164: string;
  status: "available" | "assigned" | "retired";
  twilio_incoming_phone_sid: string | null;
  elevenlabs_ready: boolean;
  assigned_artisan_id: string | null;
  assigned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const E164_RE = /^\+[1-9]\d{6,14}$/;

export function normalizePoolPhoneE164(raw: string): string | null {
  const normalized = raw.trim().replace(/[\s.]/g, "");
  if (!normalized) return null;
  return E164_RE.test(normalized) ? normalized : null;
}

export async function listVoiceNumberPool(
  supabase: SupabaseClient,
): Promise<{ rows: VoiceNumberPoolRow[]; error?: string }> {
  const { data, error } = await supabase
    .from("voice_number_pool")
    .select(
      "id, phone_e164, status, twilio_incoming_phone_sid, elevenlabs_ready, assigned_artisan_id, assigned_at, notes, created_at, updated_at",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as VoiceNumberPoolRow[] };
}

export async function addVoiceNumberToPool(
  supabase: SupabaseClient,
  input: {
    phoneE164: string;
    twilioIncomingPhoneSid?: string | null;
    elevenlabsReady?: boolean;
    notes?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const phone = normalizePoolPhoneE164(input.phoneE164);
  if (!phone) {
    return { ok: false, error: "Numéro invalide (E.164, ex. +339XXXXXXXX)." };
  }

  const { data, error } = await supabase
    .from("voice_number_pool")
    .insert({
      phone_e164: phone,
      status: "available",
      twilio_incoming_phone_sid: input.twilioIncomingPhoneSid?.trim() || null,
      elevenlabs_ready: input.elevenlabsReady ?? true,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return { ok: false, error: "Ce numéro est déjà dans le pool." };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data.id as string };
}

export async function retireVoiceNumberFromPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row } = await supabase
    .from("voice_number_pool")
    .select("status")
    .eq("id", poolId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Entrée introuvable." };
  if (row.status === "assigned") {
    return { ok: false, error: "Numéro encore attribué à un artisan — libérez-le d'abord." };
  }

  const { error } = await supabase
    .from("voice_number_pool")
    .update({ status: "retired", updated_at: new Date().toISOString() })
    .eq("id", poolId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
