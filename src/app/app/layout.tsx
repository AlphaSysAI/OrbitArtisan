import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { AcceptPendingInvite } from "@/components/invitations/accept-pending-invite";
import { getPlatformAdminUser } from "@/lib/auth/platform-admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const adminUser = await getPlatformAdminUser();

  return (
    <AppShell isPlatformAdmin={!!adminUser}>
      <Suspense fallback={null}>
        <AcceptPendingInvite />
      </Suspense>
      {children}
    </AppShell>
  );
}
