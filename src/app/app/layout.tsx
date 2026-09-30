import { Suspense } from "react";

import { ActivityPing } from "@/components/app/activity-ping";
import { AppShell } from "@/components/app/app-shell";
import { SubscriptionBanner } from "@/components/app/subscription-banner";
import { AcceptPendingInvite } from "@/components/invitations/accept-pending-invite";
import { VoiceNumberPendingGate } from "@/components/settings/voice-number-pending-gate";
import { getPlatformAdminUser } from "@/lib/auth/platform-admin";
import { getArtisanShellProfile } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Préchargement : la lecture du profil (bandeau + gate) part en parallèle du
  // contrôle admin au lieu d'attendre la fin du layout (React.cache la partage).
  void getArtisanShellProfile().catch(() => {});
  const adminUser = await getPlatformAdminUser();

  return (
    <AppShell isPlatformAdmin={!!adminUser}>
      <ActivityPing />
      <Suspense fallback={null}>
        <SubscriptionBanner />
      </Suspense>
      <Suspense fallback={null}>
        <AcceptPendingInvite />
      </Suspense>
      <Suspense fallback={null}>
        <VoiceNumberPendingGate />
      </Suspense>
      {children}
    </AppShell>
  );
}
