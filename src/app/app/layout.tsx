import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { AcceptPendingInvite } from "@/components/invitations/accept-pending-invite";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <AcceptPendingInvite />
      </Suspense>
      {children}
    </AppShell>
  );
}
