import { AppHeader } from "@/components/app/app-header";
import { ArtisanAssistant } from "@/components/app/artisan-assistant";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

export function AppShell({
  children,
  isPlatformAdmin = false,
}: {
  children: React.ReactNode;
  isPlatformAdmin?: boolean;
}) {
  return (
    <div className="app-grain min-h-svh bg-background">
      <AppHeader isPlatformAdmin={isPlatformAdmin} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <ImpersonationBanner />
        <main className="min-w-0">{children}</main>
      </div>

      <ArtisanAssistant />
    </div>
  );
}
