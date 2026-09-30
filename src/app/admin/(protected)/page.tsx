import { Building2, FileText, Receipt, TrendingUp, Users } from "lucide-react";

import Link from "next/link";

import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { getAdminDb } from "@/lib/admin/db";
import { fetchAdminPlatformMetrics } from "@/lib/admin/tenants";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const db = getAdminDb();
  const [{ metrics, issue }, openAlerts] = await Promise.all([
    fetchAdminPlatformMetrics(),
    db
      ? db.from("concierge_alerts").select("id", { count: "exact", head: true }).eq("status", "open").then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-8">
      {issue ? <AdminSetupAlert issue={issue} /> : null}
      {openAlerts > 0 ? (
        <Link
          href="/admin/conciergerie"
          className="block rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {openAlerts} chantier{openAlerts > 1 ? "s" : ""} à placer : artisans à appeler →
        </Link>
      ) : null}
      <div>
        <p className="text-sm font-medium text-muted-foreground">Plateforme</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Métriques globales SolineBTP — artisans, abonnements et activité documentaire.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Artisans inscrits" value={metrics.artisansTotal} hint={`${metrics.artisansActive} actifs`} icon={Building2} />
        <MetricCard
          label="MRR estimé"
          value={formatEur(metrics.estimatedMrrCents)}
          hint="Plans actifs (grille tarifaire)"
          icon={TrendingUp}
        />
        <MetricCard label="Comptes suspendus" value={metrics.artisansSuspended} icon={Users} />
        <MetricCard label="Devis créés" value={metrics.quotesTotal} icon={FileText} />
        <MetricCard label="Factures émises" value={metrics.invoicesTotal} icon={Receipt} />
        <MetricCard label="Clients finaux" value={metrics.customersTotal} hint="Profils customer_profiles" icon={Users} />
      </div>
    </div>
  );
}
