import { AppHeader } from "@/components/app/app-header";
import { AppMobileBottomNav } from "@/components/app/app-mobile-bottom-nav";
import { ArtisanAssistantLazy } from "@/components/app/artisan-assistant-lazy";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { PushNotificationsBanner } from "@/components/notifications/push-notifications-banner";

export function AppShell({
  children,
  isPlatformAdmin = false,
  assistantLocked = false,
}: {
  children: React.ReactNode;
  isPlatformAdmin?: boolean;
  /** Pas d'abonnement valide : l'assistant affiche un message au lieu de l'IA. */
  assistantLocked?: boolean;
}) {
  return (
    <NotificationProvider>
    <div className="app-grain min-h-svh bg-background">
      {/* Chrome masqué à l'impression (fiches techniques, documents). */}
      <div className="contents print:hidden">
        <AppHeader isPlatformAdmin={isPlatformAdmin} />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
        <div className="contents print:hidden">
          <PushNotificationsBanner />
        </div>
        <main className="min-w-0">{children}</main>
      </div>

      <div className="contents print:hidden">
        <AppMobileBottomNav isPlatformAdmin={isPlatformAdmin} />
        <ArtisanAssistantLazy locked={assistantLocked} />
      </div>
    </div>
    </NotificationProvider>
  );
}
