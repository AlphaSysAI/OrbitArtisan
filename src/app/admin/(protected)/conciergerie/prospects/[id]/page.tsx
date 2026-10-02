import Link from "next/link";
import { notFound } from "next/navigation";

import { ProspectNotesForm, ProspectQuickActions } from "@/components/admin/concierge/concierge-actions";
import { ProspectIdentity, ProspectStatusBadge } from "@/components/admin/concierge/prospect-bits";
import { getAdminDb } from "@/lib/admin/db";
import { getProspect } from "@/lib/concierge/admin-queries";
import { formatDateTimeFr } from "@/lib/format/date";

const fmt = (d: string | null) => (d ? formatDateTimeFr(d) : "—");

export default async function AdminProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getAdminDb();
  const data = db ? await getProspect(db, id) : null;
  if (!data) notFound();
  const { prospect: p, alerts, invites } = data;
  const openAlert = alerts.find((a) => a.status === "open") ?? null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/conciergerie/prospects" className="text-sm text-muted-foreground hover:underline">
        ← Prospects
      </Link>

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <ProspectIdentity p={p} />
          <ProspectStatusBadge status={p.status} />
        </div>
        {p.email ? (
          <p className="text-sm">
            E-mail pro : <span className="font-mono">{p.email}</span>{" "}
            <span className="text-xs text-muted-foreground">(utilisé seulement si le numéro est un fixe)</span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Source : {p.source ?? "—"} · importé le {fmt(p.created_at)} · {p.contact_count} contact{p.contact_count > 1 ? "s" : ""} (dernier : {fmt(p.last_contacted_at)})
          {p.latitude === null && !p.opt_out ? " · non géolocalisé : jamais suggéré" : ""}
        </p>
        {p.opt_out ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Opposition RGPD enregistrée : ce prospect ne sera plus jamais suggéré ni contacté.
          </p>
        ) : p.status === "converted" ? (
          <p className="text-sm">
            Inscrit sur Soline
            {p.converted_profile_id ? (
              <>
                {" "}
                · <Link href={`/admin/tenants/${p.converted_profile_id}`} className="underline">voir le compte</Link>
              </>
            ) : null}
            .
          </p>
        ) : (
          <>
            {openAlert ? (
              <p className="text-sm">
                Chantier en cours : <strong>{openAlert.summary.trade} · {openAlert.summary.commune ?? "?"}</strong>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun chantier ouvert : « Intéressé » envoie un lien d&apos;inscription générique.</p>
            )}
            <ProspectQuickActions prospectId={p.id} alertId={openAlert?.id ?? null} />
          </>
        )}
      </section>

      {!p.opt_out ? (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="mb-2 font-semibold">Notes</h2>
          <ProspectNotesForm prospectId={p.id} initial={p.notes ?? ""} />
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-2 font-semibold">Chantiers proposés</h2>
        {alerts.length === 0 ? <p className="text-sm text-muted-foreground">Aucun.</p> : null}
        <ul className="space-y-1 text-sm">
          {alerts.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/conciergerie?vue=toutes&alerte=${a.id}#${a.id}`} className="hover:underline">
                {fmt(a.created_at)} · {a.summary.trade} · {a.summary.commune ?? "?"}
              </Link>{" "}
              <span className="text-muted-foreground">({a.status === "open" ? "ouvert" : a.status === "handled" ? "traité" : "ignoré"})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-2 font-semibold">Liens d&apos;invitation</h2>
        {invites.length === 0 ? <p className="text-sm text-muted-foreground">Aucun.</p> : null}
        <ul className="space-y-1 text-sm">
          {invites.map((i) => (
            <li key={i.token}>
              {fmt(i.created_at)} · {i.lead_id ? "chantier" : "générique"} · envoi {i.sms_sent_at ? fmt(i.sms_sent_at) : "non effectué"} ·{" "}
              {i.claimed_at ? `utilisé le ${fmt(i.claimed_at)}` : new Date(i.expires_at) < new Date() ? "expiré" : `valable jusqu'au ${fmt(i.expires_at)}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
