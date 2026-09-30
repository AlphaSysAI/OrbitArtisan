import type { Metadata } from "next";
import Link from "next/link";

import { formatBudget } from "@/lib/concierge/summary";
import { loadInvite } from "@/lib/concierge/invites";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Un chantier vous attend sur Soline", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  taken: "Ce lien a déjà été utilisé par un autre compte.",
  expired: "Ce lien a expiré. Recontactez-nous pour en recevoir un nouveau.",
  lead_closed: "Votre compte est créé, mais ce chantier a été clôturé entre-temps. D'autres suivront.",
  full: "Votre compte est créé, mais 3 artisans ont déjà été retenus sur ce chantier. D'autres suivront.",
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { token } = await params;
  const { erreur } = await searchParams;
  const db = createSupabaseServiceRoleClient();
  const invite = db ? await loadInvite(db, token) : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claim = `/rejoindre/${token}/debloquer`;
  const s = invite?.summary;

  return (
    <main className="flex min-h-dvh justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-sm font-semibold tracking-wide text-orange-600">Soline</p>
        {!invite ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">Lien invalide</h1>
            <p className="mt-2 text-sm text-slate-600">Ce lien n&apos;est plus valable.</p>
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-2xl border bg-white p-6 shadow-sm">
              <h1 className="text-xl font-semibold">
                {s ? `Chantier ${s.trade.toLowerCase()}${s.commune ? ` à ${s.commune.replace(/^\d{5}\s/, "")}` : ""}` : `Bienvenue ${invite.prospectName}`}
              </h1>
              {s ? (
                <ul className="space-y-1 text-sm text-slate-700">
                  <li>📍 {s.commune ?? "Commune communiquée après inscription"}</li>
                  <li>💶 Budget estimé : {formatBudget(s.budget)}</li>
                  {s.need ? <li className="pt-1 italic">« {s.need} »</li> : null}
                </ul>
              ) : null}
              <p className="text-sm text-slate-600">
                Créez votre compte gratuit (2 minutes, à partir de vos anciens devis) : les coordonnées du client et le détail du
                chantier arrivent directement dans votre messagerie.
              </p>
            </section>
            {erreur && ERRORS[erreur] ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{ERRORS[erreur]}</p> : null}
            {invite.expired && !invite.claimedProfileId ? null : (
              <Link
                href={user ? claim : `/register?next=${encodeURIComponent(claim)}`}
                className="flex h-14 items-center justify-center rounded-xl bg-orange-600 text-base font-semibold text-white"
              >
                {user ? "Débloquer le chantier" : "Créer mon compte gratuit"}
              </Link>
            )}
            {!user ? (
              <p className="text-center text-sm text-slate-600">
                Déjà inscrit ?{" "}
                <Link href={`/login?role=artisan&next=${encodeURIComponent(claim)}`} className="font-medium underline">
                  Se connecter
                </Link>
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
