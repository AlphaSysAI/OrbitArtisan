import type { Metadata } from "next";
import Link from "next/link";

import { formatAppointmentWhen, loadCustomerAppointment } from "@/lib/appointments/customer-emails";
import { verifyTrackingToken } from "@/lib/appointments/tracking-link";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { cancelTrackedAppointment } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi de ma demande de rendez-vous",
  robots: { index: false, follow: false },
};

const STATUS: Record<string, { label: string; tone: string; text: string }> = {
  pending: {
    label: "En attente de confirmation",
    tone: "bg-amber-100 text-amber-900",
    text: "Le créneau vous est réservé. Vous recevrez un e-mail dès que l'artisan l'aura confirmé.",
  },
  confirmed: {
    label: "Confirmé",
    tone: "bg-emerald-100 text-emerald-800",
    text: "L'artisan a confirmé votre rendez-vous.",
  },
  cancelled: {
    label: "Annulé",
    tone: "bg-slate-200 text-slate-700",
    text: "Ce rendez-vous n'aura pas lieu. Vous pouvez choisir un autre créneau sur la page de l'artisan.",
  },
};

function isFuture(iso: string) {
  return new Date(iso).getTime() > Date.now();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-sm font-semibold tracking-wide text-orange-600">Soline</p>
        {children}
      </div>
    </main>
  );
}

export default async function TrackAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const etat = typeof sp.etat === "string" ? sp.etat : null;

  const id = verifyTrackingToken(token);
  const db = createSupabaseServiceRoleClient();
  const appt = id && db ? await loadCustomerAppointment(db, id) : null;

  if (!appt) {
    return (
      <Shell>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Lien invalide</h1>
          <p className="mt-2 text-sm text-slate-600">
            Cette demande est introuvable. Vérifiez le lien reçu par e-mail ou contactez l&apos;artisan.
          </p>
        </div>
      </Shell>
    );
  }

  const status = STATUS[appt.status] ?? STATUS.pending;
  const upcoming = isFuture(appt.startTime);
  const canCancel = upcoming && appt.status !== "cancelled";
  const next = `/rdv/suivi/${token}/rattacher`;
  const signupHref = `/inscription-client?next=${encodeURIComponent(next)}${appt.customerEmail ? `&email=${encodeURIComponent(appt.customerEmail)}` : ""}`;
  const loginHref = `/login?role=particulier&next=${encodeURIComponent(next)}${appt.customerEmail ? `&email=${encodeURIComponent(appt.customerEmail)}` : ""}`;

  return (
    <Shell>
      {etat === "annule" ? (
        <p className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">
          Votre demande est annulée. L&apos;artisan a été prévenu.
        </p>
      ) : null}
      {etat === "impossible" || etat === "erreur" ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Annulation impossible : le rendez-vous est passé ou déjà annulé.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Votre demande</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{appt.artisanName}</h1>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
          {status.label}
        </span>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium capitalize text-slate-900">{formatAppointmentWhen(appt.startTime)}</dd>
          </div>
          {appt.serviceTitle ? (
            <div>
              <dt className="text-slate-500">Prestation</dt>
              <dd className="font-medium text-slate-900">{appt.serviceTitle}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-5 text-sm leading-relaxed text-slate-600">{status.text}</p>

        <div className="mt-5 flex flex-col gap-2">
          {appt.artisanPhone ? (
            <a
              href={`tel:${appt.artisanPhone}`}
              className="flex h-11 items-center justify-center rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Appeler {appt.artisanName}
            </a>
          ) : null}
          {appt.status === "cancelled" && appt.artisanSlug ? (
            <Link
              href={`/site/${appt.artisanSlug}`}
              className="flex h-11 items-center justify-center rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Choisir un autre créneau
            </Link>
          ) : null}
          {canCancel ? (
            <form action={cancelTrackedAppointment}>
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="h-11 w-full rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Annuler ma demande
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {!appt.customerUserId ? (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Échanger avec {appt.artisanName}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Créez votre espace client gratuit pour écrire à l&apos;artisan, recevoir vos devis et factures, et
            retrouver tous vos rendez-vous au même endroit.
          </p>
          <Link
            href={signupHref}
            className="mt-4 flex h-11 items-center justify-center rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Créer mon compte
          </Link>
          <Link href={loginHref} className="mt-3 block text-center text-sm text-slate-700 underline underline-offset-4">
            J&apos;ai déjà un compte
          </Link>
        </section>
      ) : (
        <Link
          href="/compte"
          className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800"
        >
          Ouvrir mon espace client
        </Link>
      )}
    </Shell>
  );
}
