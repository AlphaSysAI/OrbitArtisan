import type { Metadata } from "next";

import { verifyOptOutToken } from "@/lib/concierge/concierge";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { confirmOptOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ne plus être contacté", robots: { index: false, follow: false } };

export default async function StopPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const { ok } = await searchParams;
  const id = verifyOptOutToken(token);
  const db = createSupabaseServiceRoleClient();
  const { data: p } = id && db ? await db.from("prospect_artisans").select("business_name, opt_out").eq("id", id).maybeSingle() : { data: null };

  return (
    <main className="flex min-h-dvh justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-orange-600">Soline</p>
        {!p ? (
          <p className="text-sm">Lien invalide.</p>
        ) : ok || p.opt_out ? (
          <>
            <h1 className="text-lg font-semibold">C&apos;est noté.</h1>
            <p className="text-sm text-slate-600">
              {p.business_name} ne sera plus contacté par Soline. Vos coordonnées sont conservées uniquement pour garantir cette
              opposition (liste d&apos;exclusion), sans autre usage.
            </p>
          </>
        ) : (
          <form action={confirmOptOut} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <h1 className="text-lg font-semibold">Ne plus être contacté</h1>
            <p className="text-sm text-slate-600">
              {p.business_name} ne recevra plus d&apos;appel ni de SMS de Soline. Vous pourrez toujours vous inscrire de vous-même.
            </p>
            <button type="submit" className="h-12 w-full rounded-xl bg-slate-900 font-semibold text-white">
              Confirmer
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
