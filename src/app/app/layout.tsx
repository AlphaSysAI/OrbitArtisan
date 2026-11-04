import { Suspense } from "react";

import { ActivityPing } from "@/components/app/activity-ping";
import { AppShell } from "@/components/app/app-shell";
import { SubscriptionBanner } from "@/components/app/subscription-banner";
import { AcceptPendingInvite } from "@/components/invitations/accept-pending-invite";
import { VoiceNumberPendingGate } from "@/components/settings/voice-number-pending-gate";
import { getPlatformAdminUser } from "@/lib/auth/platform-admin";
import { getArtisanShellProfile } from "@/lib/auth/session";
import { evaluateSubscriptionAccess } from "@/lib/billing/subscription-access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Profil (bandeau, gate, assistant) et contrôle admin en parallèle ; React.cache
  // partage la lecture du profil avec les composants du shell.
  const [adminUser, shellProfile] = await Promise.all([
    getPlatformAdminUser(),
    getArtisanShellProfile().catch(() => null),
  ]);
  // Sans formule validée (onboarding, essai non démarré, expiré, impayé…), le bouton
  // Soline reste visible mais affiche un message réservé aux abonnés.
  const assistantLocked = !evaluateSubscriptionAccess(shellProfile).allowed;

  return (
    <AppShell isPlatformAdmin={!!adminUser} assistantLocked={assistantLocked}>
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
