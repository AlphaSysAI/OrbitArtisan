import type { Metadata } from "next";
import Link from "next/link";

import { loadGuestThread, loadQuoteForResponse, markQuoteViewed, REJECTION_REASONS } from "@/lib/quotes/quote-response";
import { verifyQuoteResponseToken } from "@/lib/quotes/response-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { QuoteResponsePanel } from "./response-panel";
import { formatDateFr, formatDateTimeFr } from "@/lib/format/date";
import { formatCents } from "@/lib/format/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Répondre au devis",
  robots: { index: false, follow: false },
};

function dateFr(iso: string, withTime = false) {
  return withTime ? formatDateTimeFr(iso, { dateStyle: "long", timeStyle: "short" }) : formatDateFr(iso, { dateStyle: "long" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <div className="w-full max-w-lg space-y-4">{children}</div>
    </main>
  );
}

export default async function QuoteResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyQuoteResponseToken(token);
  const db = createSupabaseServiceRoleClient();
  const view = id && db ? await loadQuoteForResponse(db, id) : null;

  if (!view || !db) {
    return (
      <Shell>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Lien invalide</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ce devis est introuvable. Vérifiez le lien reçu par e-mail ou contactez directement l&apos;artisan.
          </p>
        </div>
      </Shell>
    );
  }

  void markQuoteViewed(db, view.id);
  const thread = await loadGuestThread(db, view);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accent = /^#[0-9a-f]{6}$/i.test(view.artisan.accentColor ?? "") ? view.artisan.accentColor! : "#ea580c";

  return (
    <Shell>
      <header className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        {view.artisan.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.artisan.logoUrl} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
        ) : (
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {view.artisan.businessName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{view.artisan.businessName}</p>
          <p className="text-sm text-slate-500">Devis n° {view.quoteNumber}</p>
        </div>
      </header>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Montant total</p>
            <p className="text-3xl font-bold tabular-nums">{formatCents(view.totalTtcCents)}</p>
            <p className="text-sm text-slate-500">
              {view.vatFranchise ? "TVA non applicable, art. 293 B du CGI" : `TTC · ${formatCents(view.totalHtCents)} HT`}
            </p>
          </div>
          <a
            href={`/devis/reponse/${token}/pdf`}
            target="_blank"
            rel="noopener"
            className="shrink-0 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Voir le PDF
          </a>
        </div>
        {view.validUntil && view.status === "sent" ? (
          <p className={`mt-3 text-sm ${view.expired ? "font-medium text-red-700" : "text-slate-500"}`}>
            {view.expired ? "Devis expiré depuis le " : "Valable jusqu'au "}
            {dateFr(view.validUntil)}
          </p>
        ) : null}

        {view.status === "accepted" && view.signedAt ? (
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Devis accepté</p>
            <p className="mt-1">
              Le {dateFr(view.signedAt, true)} par {view.signedByName}. Une copie vous a été envoyée par e-mail.
            </p>
          </div>
        ) : null}
        {view.status === "rejected" ? (
          <div className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
            <p className="font-semibold">Devis décliné</p>
            <p className="mt-1">
              {view.rejectedAt ? `Le ${dateFr(view.rejectedAt, true)}` : ""}
              {view.rejectionReason && view.rejectionReason in REJECTION_REASONS
                ? ` · ${REJECTION_REASONS[view.rejectionReason as keyof typeof REJECTION_REASONS]}`
                : ""}
              . Vous pouvez toujours contacter l&apos;artisan ci-dessous.
            </p>
          </div>
        ) : null}
      </section>

      <QuoteResponsePanel
        token={token}
        accent={accent}
        canRespond={view.status === "sent" && !view.expired}
        artisanName={view.artisan.businessName}
        artisanPhone={view.artisan.phone}
        defaultName={view.customerName ?? ""}
        defaultPhone={view.clientPhone ?? ""}
        callbackRequested={Boolean(view.callbackRequestedAt)}
        guestMessaging={!view.customerUserId}
        thread={thread}
      />

      <footer className="space-y-2 px-1 pb-6 text-center text-xs text-slate-500">
        {view.customerUserId ? (
          <p>
            <Link href={`/mes-devis/${view.id}`} className="font-medium underline underline-offset-4">
              Retrouver ce devis dans mon espace
            </Link>
          </p>
        ) : (
          <p>
            <Link href={`/devis/reponse/${token}/rattacher`} className="font-medium underline underline-offset-4">
              {user ? "Ajouter ce devis à mon espace client" : "Créer mon espace client (facultatif)"}
            </Link>{" "}
            pour retrouver vos devis, factures et échanges au même endroit.
          </p>
        )}
        <p>Page sécurisée propre à votre devis — ne la transférez pas. Service fourni par Soline.</p>
      </footer>
    </Shell>
  );
}
