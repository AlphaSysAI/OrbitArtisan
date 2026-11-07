import { Sparkles } from "lucide-react";
import Link from "next/link";

import { ClientSheetsBrowser, type ClientSheetItem } from "@/components/client-space/client-sheets-browser";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireCustomer } from "@/lib/client-space/require-customer";
import { CLIENT_SHEET_DISCLAIMER, CLIENT_SHEET_LIBRARY, sortClientSheets } from "@/lib/technical-sheets/client/library";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { sheetTextSegments } from "@/lib/technical-sheets/sheet-search";

/** La recherche intelligente (server action de cette page) appelle l'IA. */
export const maxDuration = 30;

export const metadata = { title: "Dépannage" };

export default async function ClientTroubleshootingPage() {
  const auth = await requireCustomer();
  const reviews = auth.ok ? await loadSheetReviews(auth.customer.supabase) : new Map();

  const sheets: ClientSheetItem[] = sortClientSheets(CLIENT_SHEET_LIBRARY)
    .filter((sheet) => reviews.get(sheet.id)?.status !== "needs_changes")
    .map((sheet) => ({
      id: sheet.id,
      title: sheet.title,
      summary: sheet.summary,
      domain: sheet.domain,
      level: sheet.level,
      segments: [...sheetTextSegments(sheet), ...sheet.whenToCallPro],
    }));

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Dépannage</h1>
          <p className="max-w-2xl text-muted-foreground">
            Les bons gestes face à une panne, une fuite ou un souci dans le logement, et quand faire venir un professionnel.
          </p>
        </div>
        <Link href="/compte/assistant" className={buttonVariants({ variant: "outline", className: "gap-2" })}>
          <Sparkles className="size-4" aria-hidden /> Demander à l&apos;assistant
        </Link>
      </header>

      <ClientSheetsBrowser sheets={sheets} />

      <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">{CLIENT_SHEET_DISCLAIMER}</p>
    </div>
  );
}
