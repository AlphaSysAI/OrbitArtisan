import type { Metadata } from "next";

import { findConfirmationByToken } from "@/lib/accounting/accountant-confirmation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { answerAccountantInvite } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Envois comptables — Soline",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  accepte: {
    title: "C'est confirmé",
    body: "Vous recevrez les documents comptables de l'entreprise à chaque fin de mois. L'entreprise est en copie de chaque envoi : pour toute question, répondez simplement à l'e-mail.",
  },
  refuse: {
    title: "Refus enregistré",
    body: "Vous ne recevrez aucun envoi. L'entreprise a été prévenue que son adresse de comptable doit être corrigée.",
  },
  expire: {
    title: "Lien expiré",
    body: "Ce lien n'est plus valable. Si besoin, demandez à l'entreprise de vous renvoyer une invitation depuis Soline.",
  },
  invalide: {
    title: "Lien invalide ou déjà utilisé",
    body: "Cette demande a déjà reçu une réponse ou n'existe plus. Aucun envoi n'a lieu sans votre accord.",
  },
  erreur: {
    title: "Une erreur est survenue",
    body: "Réessayez dans quelques instants depuis le lien reçu par e-mail.",
  },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-orange-600">Soline</p>
        {children}
      </div>
    </main>
  );
}

export default async function AccountantConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const etat = typeof sp.etat === "string" ? sp.etat : null;

  if (etat && MESSAGES[etat]) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">{MESSAGES[etat].title}</h1>
        <p className="text-sm leading-relaxed text-slate-600">{MESSAGES[etat].body}</p>
      </Shell>
    );
  }

  const db = createSupabaseServiceRoleClient();
  const found = db ? await findConfirmationByToken(db, token) : ({ ok: false, error: "invalid" } as const);
  if (!found.ok) {
    const msg = MESSAGES[found.error === "expired" ? "expire" : "invalide"];
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">{msg.title}</h1>
        <p className="text-sm leading-relaxed text-slate-600">{msg.body}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-slate-900">Envois comptables de {found.businessName}</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        <strong>{found.businessName}</strong> vous a indiqué comme son comptable ({found.accountantEmail}). Si vous
        acceptez, vous recevrez chaque fin de mois ses factures émises (PDF Factur-X et récapitulatif CSV) et les
        pièces qu&apos;elle aura ajoutées.
      </p>
      <p className="text-sm leading-relaxed text-slate-600">
        Vous pourrez arrêter à tout moment en le demandant à l&apos;entreprise ou à support@solinebtp.fr.
      </p>
      <form action={answerAccountantInvite} className="flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          name="decision"
          value="accept"
          className="h-11 flex-1 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
        >
          J&apos;accepte
        </button>
        <button
          type="submit"
          name="decision"
          value="decline"
          className="h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Je refuse
        </button>
      </form>
    </Shell>
  );
}
