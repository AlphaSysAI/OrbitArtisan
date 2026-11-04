import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { formatDateFr } from "@/lib/format/date";
import { LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";

export const metadata: Metadata = {
  title: "Compte supprimé",
  robots: { index: false, follow: false },
};

function purgeDateLabel(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDateFr(date, { dateStyle: "long" });
}

export default async function AccountDeletedPage({ searchParams }: { searchParams: Promise<{ le?: string | string[] }> }) {
  const date = purgeDateLabel((await searchParams).le);
  return (
    <LegalPageShell title="Votre compte est supprimé">
      <section className="space-y-3">
        <ul className="list-disc space-y-2 pl-5">
          <li>Votre abonnement est résilié : plus aucun prélèvement. La période en cours déjà payée n&apos;est pas remboursée.</li>
          <li>L&apos;accès à votre espace est fermé et votre numéro Soline est désactivé.</li>
          <li>
            Vos données seront définitivement effacées {date ? <>le <strong>{date}</strong></> : "sous 30 jours"}.
          </li>
        </ul>
        <p>
          D&apos;ici là, vous pouvez demander une copie de vos données ou annuler la suppression en écrivant à{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>
          . Un e-mail de confirmation vous a été envoyé.
        </p>
      </section>
    </LegalPageShell>
  );
}
