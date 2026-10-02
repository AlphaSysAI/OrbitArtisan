import Link from "next/link";

import { AlertStatusButtons, ProspectQuickActions } from "@/components/admin/concierge/concierge-actions";
import { ProspectIdentity, ProspectStatusBadge } from "@/components/admin/concierge/prospect-bits";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAdminDb } from "@/lib/admin/db";
import { listAlerts } from "@/lib/concierge/admin-queries";
import { formatBudget } from "@/lib/concierge/summary";
import { cn } from "@/lib/utils";
import { formatDateTimeFr } from "@/lib/format/date";


export default async function AdminConciergePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showAll = sp.vue === "toutes";
  const focus = typeof sp.alerte === "string" ? sp.alerte : null;
  const db = getAdminDb();
  const alerts = db ? await listAlerts(db, { onlyOpen: !showAll }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AppPageHeader
          eyebrow="Apport d'affaires"
          title="Conciergerie"
          description="Chantiers sans 3 artisans inscrits : appelez les prospects de la zone (≤ 40 km), puis 1 clic selon la réponse."
        />
        <div className="flex gap-2">
          <Link
            href={showAll ? "/admin/conciergerie" : "/admin/conciergerie?vue=toutes"}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {showAll ? "Alertes ouvertes" : "Toutes les alertes"}
          </Link>
          <Link href="/admin/conciergerie/prospects" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Prospects & import
          </Link>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucune alerte {showAll ? "" : "ouverte"}.</p>
      ) : (
        <div className="space-y-4">
          {alerts.map((a) => (
            <section
              key={a.id}
              id={a.id}
              className={cn("rounded-2xl border bg-card p-4 shadow-sm sm:p-5", focus === a.id && "ring-2 ring-primary")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {a.summary.trade} · {a.summary.commune ?? "commune inconnue"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Budget {formatBudget(a.summary.budget)} · {a.registered_count} inscrit{a.registered_count > 1 ? "s" : ""} déjà positionné
                    {a.registered_count > 1 ? "s" : ""} · {formatDateTimeFr(a.created_at)}
                  </p>
                  {a.summary.need ? <p className="mt-2 max-w-3xl text-sm">{a.summary.need}</p> : null}
                </div>
                <AlertStatusButtons alertId={a.id} status={a.status} />
              </div>

              {a.prospects.length ? (
                <ul className="mt-4 divide-y rounded-xl border">
                  {a.prospects.map((p) => (
                    <li key={p.id} className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
                      <div className="flex items-start justify-between gap-2">
                        <ProspectIdentity p={p} />
                        <ProspectStatusBadge status={p.status} />
                      </div>
                      {p.status === "converted" ? (
                        <p className="text-sm text-muted-foreground">Déjà inscrit.</p>
                      ) : (
                        <ProspectQuickActions prospectId={p.id} alertId={a.id} />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun prospect à ≤ 40 km pour ce métier : importez un fichier couvrant cette zone.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
