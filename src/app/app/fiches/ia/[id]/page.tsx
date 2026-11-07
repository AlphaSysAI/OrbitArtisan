import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteAiSheetButton, PrintSheetButton } from "@/components/technical-sheets/sheet-actions";
import { TechnicalSheetView } from "@/components/technical-sheets/sheet-view";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { getAccountAiSheet } from "@/lib/technical-sheets/data";

export const metadata = { title: "Fiche générée" };

export default async function AiTechnicalSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profileId } = await requireArtisanProfileIdOrRedirect();
  const sheet = await getAccountAiSheet(supabase, profileId, id);
  if (!sheet) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/fiches" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft aria-hidden /> Fiches techniques
        </Link>
        <div className="flex gap-2">
          <PrintSheetButton />
          <DeleteAiSheetButton id={sheet.id} />
        </div>
      </div>
      <TechnicalSheetView
        sheet={sheet.content}
        trust={{ kind: "ai" }}
        meta={`Demande : « ${sheet.request} » · ${new Date(sheet.createdAt).toLocaleDateString("fr-FR")}`}
      />
    </div>
  );
}
