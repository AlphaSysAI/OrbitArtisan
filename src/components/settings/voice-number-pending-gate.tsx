import { getArtisanShellProfile, getRequestSupabase } from "@/lib/auth/session";
import { planIncludesSolineVoice } from "@/lib/voice/soline-voice-access";

import { VoiceNumberPendingDialog } from "./voice-number-pending-dialog";

/** Popup « pool vide » dès qu’un artisan Pro/Premium ouvre l’espace pro. */
export async function VoiceNumberPendingGate() {
  const profile = await getArtisanShellProfile();
  if (!profile?.id) return null;

  if (!planIncludesSolineVoice(profile.subscription_plan)) return null;

  const pendingAt = profile.voice_number_assignment_pending_at as string | null;
  if (!pendingAt) return null;

  const supabase = await getRequestSupabase();
  const { data: mapping } = await supabase
    .from("artisan_voice_numbers")
    .select("phone_e164")
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (mapping?.phone_e164) return null;

  return <VoiceNumberPendingDialog defaultOpen />;
}
