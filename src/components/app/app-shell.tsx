import { AppHeader } from "@/components/app/app-header";
import { AppMobileBottomNav } from "@/components/app/app-mobile-bottom-nav";
import { ArtisanAssistant } from "@/components/app/artisan-assistant";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { NotificationProvider } from "@/components/notifications/notification-provider";

export function AppShell({
  children,
  isPlatformAdmin = false,
}: {
  children: React.ReactNode;
  isPlatformAdmin?: boolean;
}) {
  return (
    <NotificationProvider>
    <div className="app-grain min-h-svh bg-background">
      <AppHeader isPlatformAdmin={isPlatformAdmin} />

      <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
        <ImpersonationBanner />
        <main className="min-w-0">{children}</main>
      </div>

      <AppMobileBottomNav isPlatformAdmin={isPlatformAdmin} />
      <ArtisanAssistant />
    </div>
    </NotificationProvider>
  );
}
