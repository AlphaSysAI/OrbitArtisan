import { redirect } from "next/navigation";

import { getArtisanShellProfile } from "@/lib/auth/session";
import { solineCallsDestination } from "@/lib/voice/soline-voice-access";

/** Porte d'entrée unique « Appels Soline » (navigation + promos). */
export default async function SolineCallsHubPage() {
  const profile = await getArtisanShellProfile();
  redirect(solineCallsDestination(profile?.subscription_plan));
}
