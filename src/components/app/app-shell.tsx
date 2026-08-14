import { AppHeader } from "@/components/app/app-header";
import { ArtisanAssistant } from "@/components/app/artisan-assistant";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-grain min-h-svh bg-background">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <main className="min-w-0">{children}</main>
      </div>

      <ArtisanAssistant />
    </div>
  );
}
