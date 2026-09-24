"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { addVoiceNumberToPool, retireVoiceNumberFromPool } from "@/lib/voice/voice-number-pool";

async function guardAdminPool() {
  const adminRes = await requirePlatformAdminSafe();
  if (!adminRes.ok) {
    if (adminRes.error === "auth") redirect("/login?next=/admin/telecom/pool");
    redirect("/admin/forbidden");
  }
  const sb = createSupabaseServiceRoleClient();
  if (!sb) throw new Error("Service role indisponible.");
  return sb;
}

export async function adminAddVoiceNumberToPool(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await guardAdminPool();
  const phone = String(formData.get("phone_e164") ?? "");
  const sid = String(formData.get("twilio_sid") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const elevenlabsReady = formData.get("elevenlabs_ready") === "on";

  const result = await addVoiceNumberToPool(sb, {
    phoneE164: phone,
    twilioIncomingPhoneSid: sid || null,
    elevenlabsReady,
    notes: notes || null,
  });

  if (!result.ok) return result;

  revalidatePath("/admin/telecom/pool");
  return { ok: true };
}

export async function adminRetirePoolNumber(poolId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await guardAdminPool();
  const result = await retireVoiceNumberFromPool(sb, poolId);
  if (!result.ok) return result;
  revalidatePath("/admin/telecom/pool");
  return { ok: true };
}
