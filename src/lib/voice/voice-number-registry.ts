import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type VoiceNumberArtisanSnapshot = {
  captured_at: string;
  profile_id: string;
  user_id: string;
  email: string | null;
  registration_ip: string | null;
  registration_recorded_at: string | null;
  business_name: string;
  name: string | null;
  siret: string | null;
  siren: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
};

type ProfileRow = {
  id: string;
  user_id: string;
  business_name: string;
  name: string | null;
  siret: string | null;
  siren: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  registration_ip: string | null;
  registration_recorded_at: string | null;
};

export async function loadProfileForVoiceSnapshot(
  supabase: SupabaseClient,
  artisanId: string,
): Promise<{ profile: ProfileRow; email: string | null } | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, user_id, business_name, name, siret, siren, vat_number, address_line1, address_line2, postal_code, city, phone, registration_ip, registration_recorded_at",
    )
    .eq("id", artisanId)
    .maybeSingle();

  if (error || !profile) return null;

  const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
  return { profile: profile as ProfileRow, email: userData?.user?.email ?? null };
}

export function buildVoiceNumberArtisanSnapshot(
  profile: ProfileRow,
  email: string | null,
): VoiceNumberArtisanSnapshot {
  const capturedAt = new Date().toISOString();
  return {
    captured_at: capturedAt,
    profile_id: profile.id,
    user_id: profile.user_id,
    email,
    registration_ip: profile.registration_ip,
    registration_recorded_at: profile.registration_recorded_at,
    business_name: profile.business_name,
    name: profile.name,
    siret: profile.siret,
    siren: profile.siren,
    vat_number: profile.vat_number,
    address_line1: profile.address_line1,
    address_line2: profile.address_line2,
    postal_code: profile.postal_code,
    city: profile.city,
    phone: profile.phone,
  };
}

export async function closeOpenVoiceAssignments(params: {
  supabase: SupabaseClient;
  phoneE164?: string;
  artisanId?: string;
  releaseReason: string;
  releasedAt?: string;
}): Promise<void> {
  const releasedAt = params.releasedAt ?? new Date().toISOString();
  let query = params.supabase
    .from("voice_number_assignments")
    .update({ released_at: releasedAt, release_reason: params.releaseReason })
    .is("released_at", null);

  if (params.phoneE164) {
    query = query.eq("phone_e164", params.phoneE164);
  }
  if (params.artisanId) {
    query = query.eq("artisan_id", params.artisanId);
  }

  await query;
}

export async function openVoiceNumberAssignment(params: {
  supabase: SupabaseClient;
  phoneE164: string;
  artisanId: string;
  userId: string;
  snapshot: VoiceNumberArtisanSnapshot;
  assignedBy: string;
  assignedAt?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await params.supabase.from("voice_number_assignments").insert({
    phone_e164: params.phoneE164,
    artisan_id: params.artisanId,
    user_id: params.userId,
    assigned_at: params.assignedAt ?? new Date().toISOString(),
    assigned_by: params.assignedBy,
    artisan_snapshot: params.snapshot,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "phone_already_assigned" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Synchronise artisan_voice_numbers + registre (service role requis). */
export async function syncArtisanVoiceNumberMapping(params: {
  supabase: SupabaseClient;
  artisanId: string;
  phoneE164: string | null;
  assignedBy: string;
  releaseReasonWhenCleared: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadProfileForVoiceSnapshot(params.supabase, params.artisanId);
  if (!loaded) return { ok: false, error: "profile_not_found" };

  const { profile, email } = loaded;
  const now = new Date().toISOString();

  const { data: existingMapping } = await params.supabase
    .from("artisan_voice_numbers")
    .select("phone_e164")
    .eq("artisan_id", params.artisanId)
    .maybeSingle();

  const previousPhone = (existingMapping?.phone_e164 as string | undefined) ?? null;
  const nextPhone = params.phoneE164?.trim() || null;

  if (previousPhone === nextPhone) {
    return { ok: true };
  }

  if (previousPhone) {
    await closeOpenVoiceAssignments({
      supabase: params.supabase,
      artisanId: params.artisanId,
      phoneE164: previousPhone,
      releaseReason: params.releaseReasonWhenCleared,
      releasedAt: now,
    });
  }

  await params.supabase.from("artisan_voice_numbers").delete().eq("artisan_id", params.artisanId);

  if (!nextPhone) {
    return { ok: true };
  }

  await closeOpenVoiceAssignments({
    supabase: params.supabase,
    phoneE164: nextPhone,
    releaseReason: "reassigned_to_other_artisan",
    releasedAt: now,
  });

  const snapshot = buildVoiceNumberArtisanSnapshot(profile, email);
  const opened = await openVoiceNumberAssignment({
    supabase: params.supabase,
    phoneE164: nextPhone,
    artisanId: params.artisanId,
    userId: profile.user_id,
    snapshot,
    assignedBy: params.assignedBy,
    assignedAt: now,
  });
  if (!opened.ok) return opened;

  const { error: insertErr } = await params.supabase.from("artisan_voice_numbers").insert({
    phone_e164: nextPhone,
    artisan_id: params.artisanId,
    is_active: true,
  });

  if (insertErr) {
    await closeOpenVoiceAssignments({
      supabase: params.supabase,
      phoneE164: nextPhone,
      artisanId: params.artisanId,
      releaseReason: "mapping_insert_failed",
      releasedAt: now,
    });
    const msg = insertErr.message.includes("duplicate")
      ? "phone_already_assigned"
      : insertErr.message;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export type VoiceAssignmentLookupRow = {
  assignment_id: string;
  phone_e164: string;
  artisan_id: string;
  user_id: string;
  assigned_at: string;
  released_at: string | null;
  release_reason: string | null;
  assigned_by: string;
  artisan_snapshot: VoiceNumberArtisanSnapshot;
};

export async function resolveVoiceAssigneeAt(
  supabase: SupabaseClient,
  phoneE164: string,
  instantIso?: string,
): Promise<VoiceAssignmentLookupRow | null> {
  const { data, error } = await supabase.rpc("resolve_voice_number_assignee_at", {
    p_phone_e164: phoneE164.trim(),
    p_instant: instantIso ?? new Date().toISOString(),
  });

  if (error || !data?.length) return null;
  const row = data[0] as VoiceAssignmentLookupRow;
  return row;
}
