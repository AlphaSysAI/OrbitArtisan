import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { AdminPagination, adminHref } from "@/components/admin/ui/admin-pagination";
import { AdminTabs } from "@/components/admin/ui/admin-tabs";
import { SubscriptionBadges } from "@/components/admin/ui/subscription-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminTenants, parseTenantView, TENANT_VIEWS, type AdminTenantRow } from "@/lib/admin/tenants";
import { formatDateFr } from "@/lib/format/date";

function displayName(t: AdminTenantRow) {
  return t.businessName.trim() || (t.onboardingCompletedAt ? "Sans raison sociale" : "Inscription en cours");
}

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const view = parseTenantView(sp.vue);
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;
  const result = await listAdminTenants({ q, page, view });
  const href = (p: number, v = view) => adminHref("/admin/tenants", { vue: v === "all" ? null : v, q: q || null, page: p });

  return (
    <div className="space-y-5">
      {result.issue ? <AdminSetupAlert issue={result.issue} /> : null}
      <AppPageHeader eyebrow="Gestion" title="Artisans" description="Comptes artisans, abonnements et accès." />

      <form action="/admin/tenants" className="flex gap-2">
        {view !== "all" ? <input type="hidden" name="vue" value={view} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Raison sociale, nom, e-mail, SIRET…" className="h-11 pl-9" />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          Chercher
        </Button>
      </form>

      <AdminTabs
        tabs={TENANT_VIEWS.map((v) => ({ href: href(1, v.id), label: v.label, count: result.counts[v.id] ?? null, active: v.id === view }))}
      />

      {q ? (
        <p className="text-sm text-muted-foreground">
          {result.total} résultat{result.total > 1 ? "s" : ""} pour « {q} » ·{" "}
          <Link href={href(1)} className="underline underline-offset-4">
            effacer
          </Link>
        </p>
      ) : null}

      {result.items.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun artisan dans cette vue.</p>
      ) : (
        <>
          {/* Mobile : cartes */}
          <ul className="space-y-2 md:hidden">
            {result.items.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tenants/${t.id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate font-medium">{displayName(t)}</p>
                    <p className="truncate text-xs text-muted-foreground">{[t.name, t.email].filter(Boolean).join(" · ") || "—"}</p>
                    <SubscriptionBadges status={t.subscriptionStatus} plan={t.subscriptionPlan} trialEndsAt={t.trialEndsAt} accountStatus={t.accountStatus} deletedAt={t.deletedAt} />
                    <p className="text-xs text-muted-foreground">
                      Inscrit le {formatDateFr(t.createdAt)} · {t.quotesCount} devis · {t.invoicesCount} factures
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Ordinateur : tableau */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Entreprise</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Abonnement</th>
                  <th className="px-4 py-3 font-medium">Activité</th>
                  <th className="px-4 py-3 font-medium">Inscrit le</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">
                        {displayName(t)}
                      </Link>
                      {t.siret ? <p className="font-mono text-xs text-muted-foreground">{t.siret}</p> : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p>{t.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{t.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SubscriptionBadges status={t.subscriptionStatus} plan={t.subscriptionPlan} trialEndsAt={t.trialEndsAt} accountStatus={t.accountStatus} deletedAt={t.deletedAt} />
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-muted-foreground">
                      {t.quotesCount} devis · {t.invoicesCount} factures
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{formatDateFr(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AdminPagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={(p) => href(p)} />
    </div>
  );
}
