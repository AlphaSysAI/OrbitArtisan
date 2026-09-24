"use server";

import { redirect } from "next/navigation";

import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveVoiceAssigneeAt,
  type VoiceNumberArtisanSnapshot,
} from "@/lib/voice/voice-number-registry";

export type VoiceAssignmentHistoryRow = {
  id: string;
  phone_e164: string;
  assigned_at: string;
  released_at: string | null;
  release_reason: string | null;
  assigned_by: string;
  artisan_snapshot: VoiceNumberArtisanSnapshot;
};

export async function lookupVoiceNumberAt(params: {
  phoneE164: string;
  instantIso?: string;
}): Promise<
  | { ok: true; match: VoiceAssignmentHistoryRow | null; history: VoiceAssignmentHistoryRow[] }
  | { ok: false; error: string }
> {
  const adminRes = await requirePlatformAdminSafe();
  if (!adminRes.ok) {
    if (adminRes.error === "auth") redirect("/login?next=/admin/telecom");
    redirect("/admin/forbidden");
  }

  const phone = params.phoneE164.trim().replace(/[\s.]/g, "");
  if (!phone.startsWith("+") || phone.length < 8) {
    return { ok: false, error: "Numéro invalide (format E.164, ex. +339XXXXXXXX)." };
  }

  const sb = createSupabaseServiceRoleClient();
  if (!sb) return { ok: false, error: "Service role indisponible." };

  const instant = params.instantIso?.trim() || new Date().toISOString();

  const { data: historyRows, error: histErr } = await sb
    .from("voice_number_assignments")
    .select("id, phone_e164, assigned_at, released_at, release_reason, assigned_by, artisan_snapshot")
    .eq("phone_e164", phone)
    .order("assigned_at", { ascending: false })
    .limit(50);

  if (histErr) return { ok: false, error: histErr.message };

  const history = (historyRows ?? []) as VoiceAssignmentHistoryRow[];
  const matchRaw = await resolveVoiceAssigneeAt(sb, phone, instant);

  const match: VoiceAssignmentHistoryRow | null = matchRaw
    ? {
        id: matchRaw.assignment_id,
        phone_e164: matchRaw.phone_e164,
        assigned_at: matchRaw.assigned_at,
        released_at: matchRaw.released_at,
        release_reason: matchRaw.release_reason,
        assigned_by: matchRaw.assigned_by,
        artisan_snapshot: matchRaw.artisan_snapshot,
      }
    : null;

  return { ok: true, match, history };
}
