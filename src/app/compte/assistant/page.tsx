import { loadConnectionDefaultsAction } from "@/app/compte/assistance-actions";
import { ClientAssistantChat } from "@/components/client-space/client-assistant-chat";

/** Assistant et mise en relation (server actions de cette page) appellent l'IA. */
export const maxDuration = 60;

export const metadata = { title: "Assistant dépannage" };

export default async function ClientAssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, defaults] = await Promise.all([searchParams, loadConnectionDefaultsAction()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Assistant dépannage</h1>
        <p className="text-muted-foreground">
          Une panne, une fuite, un bruit bizarre ? Décrivez la situation : Soline vous guide et trouve un artisan si besoin.
        </p>
      </header>
      <ClientAssistantChat defaults={defaults} initialQuestion={String(q ?? "").slice(0, 500)} />
    </div>
  );
}
