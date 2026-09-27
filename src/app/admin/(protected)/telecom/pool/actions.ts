"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { syncSubscriptionVoiceNumber } from "@/lib/voice/subscription-voice-number-sync";
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

  // Le pool servait vide : on sert tout de suite le plus ancien compte Pro/Premium
  // en attente, sinon il reste bloqué sur « Attribution en cours… ».
  if (elevenlabsReady) {
    const { data: waiting } = await sb
      .from("profiles")
      .select("id, subscription_plan, subscription_status")
      .not("voice_number_assignment_pending_at", "is", null)
      .in("subscription_plan", ["pro", "premium"])
      .in("subscription_status", ["active", "trialing", "past_due"])
      .order("voice_number_assignment_pending_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (waiting?.id) {
      const sync = await syncSubscriptionVoiceNumber(sb, {
        profileId: waiting.id as string,
        planId: waiting.subscription_plan as SubscriptionPlanId,
        subscriptionStatus: waiting.subscription_status as SubscriptionStatus,
      });
      if (sync.error) console.error("[voice pool] attribution au compte en attente", sync.error);
      revalidatePath(`/admin/tenants/${waiting.id}`);
      revalidatePath("/app/reglages");
    }
  }

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
