import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { SubscriptionBanner } from "@/components/app/subscription-banner";
import { AcceptPendingInvite } from "@/components/invitations/accept-pending-invite";
import { getPlatformAdminUser } from "@/lib/auth/platform-admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const adminUser = await getPlatformAdminUser();

  return (
    <AppShell isPlatformAdmin={!!adminUser}>
      <SubscriptionBanner />
      <Suspense fallback={null}>
        <AcceptPendingInvite />
      </Suspense>
      {children}
    </AppShell>
  );
}
