import { getPlanVoiceMinutes, type SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { VoiceNumberPendingDialog } from "./voice-number-pending-dialog";

/** Popup « pool vide » dès qu’un artisan Pro/Premium ouvre l’espace pro. */
export async function VoiceNumberPendingGate() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, subscription_plan, voice_number_assignment_pending_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return null;

  const plan = profile.subscription_plan as SubscriptionPlanId | null;
  const planIncludesVoice =
    plan === "pro" || plan === "premium" ? getPlanVoiceMinutes(plan) > 0 : false;
  if (!planIncludesVoice) return null;

  const pendingAt = profile.voice_number_assignment_pending_at as string | null;
  if (!pendingAt) return null;

  const { data: mapping } = await supabase
    .from("artisan_voice_numbers")
    .select("phone_e164")
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (mapping?.phone_e164) return null;

  return <VoiceNumberPendingDialog defaultOpen />;
}
