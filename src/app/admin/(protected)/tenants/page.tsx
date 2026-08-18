import Link from "next/link";

import { TenantActions, TenantStatusBadges } from "@/components/admin/tenant-actions";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { TenantFilters } from "@/components/admin/tenant-filters";
import { buttonVariants } from "@/components/ui/button-variants";
import { listAdminTenants, type ArtisanAccountStatus } from "@/lib/admin/tenants";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const plan = typeof sp.plan === "string" ? sp.plan : "all";
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;

  const result = await listAdminTenants({
    q,
    page,
    accountStatus: status as ArtisanAccountStatus | "all",
    subscriptionPlan: plan as SubscriptionPlanId | "all",
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-8">
      {result.issue ? <AdminSetupAlert issue={result.issue} /> : null}
      <div>
        <p className="text-sm font-medium text-muted-foreground">Gestion</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Artisans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total} compte{result.total > 1 ? "s" : ""} · page {result.page} / {totalPages}
        </p>
      </div>

      <TenantFilters q={q} accountStatus={status} subscriptionPlan={plan} />

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Entreprise</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Plan / Statut</th>
              <th className="px-4 py-3 font-semibold">Activité</th>
              <th className="px-4 py-3 font-semibold">Inscription</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!result.items.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun artisan trouvé.
                </td>
              </tr>
            ) : (
              result.items.map((tenant) => (
                <tr key={tenant.id} className="border-b last:border-0">
                  <td className="px-4 py-4 align-top">
                    <Link href={`/admin/tenants/${tenant.id}`} className="font-medium hover:underline">
                      {tenant.businessName}
                    </Link>
                    {tenant.siret ? (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">SIRET {tenant.siret}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p>{tenant.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{tenant.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <TenantStatusBadges tenant={tenant} />
                  </td>
                  <td className="px-4 py-4 align-top tabular-nums">
                    {tenant.quotesCount} devis · {tenant.invoicesCount} factures
                  </td>
                  <td className="px-4 py-4 align-top text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <TenantActions tenant={tenant} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/tenants?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${status !== "all" ? `&status=${status}` : ""}${plan !== "all" ? `&plan=${plan}` : ""}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ← Précédent
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/tenants?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${status !== "all" ? `&status=${status}` : ""}${plan !== "all" ? `&plan=${plan}` : ""}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Suivant →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
