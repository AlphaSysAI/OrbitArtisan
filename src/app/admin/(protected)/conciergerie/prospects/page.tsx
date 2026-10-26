import Link from "next/link";
import { Search } from "lucide-react";

import { ProspectImportForm } from "@/components/admin/concierge/concierge-actions";
import { ProspectIdentity, ProspectStatusBadge } from "@/components/admin/concierge/prospect-bits";
import { AppPageHeader } from "@/components/app/app-page-header";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { AdminPagination, adminHref } from "@/components/admin/ui/admin-pagination";
import { AdminTabs } from "@/components/admin/ui/admin-tabs";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { getAdminDb } from "@/lib/admin/db";
import { formatDateFr } from "@/lib/format/date";
import { listProspects, PROSPECT_PAGE_SIZE, type ProspectStatus } from "@/lib/concierge/admin-queries";

const STATUSES: { id: ProspectStatus | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "new", label: "Nouveaux" },
  { id: "contacted", label: "Contactés" },
  { id: "converted", label: "Inscrits" },
  { id: "blacklisted", label: "Ne plus contacter" },
];

export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const statusParam = typeof sp.statut === "string" ? sp.statut : "all";
  const status = (STATUSES.some((s) => s.id === statusParam) ? statusParam : "all") as ProspectStatus | "all";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const db = getAdminDb();
  const { rows, total } = db ? await listProspects(db, { status, q, page }) : { rows: [], total: 0 };
  const href = (p: number, s: string = status) =>
    adminHref("/admin/conciergerie/prospects", { q: q || null, statut: s === "all" ? null : s, page: p });

  return (
    <div className="space-y-5">
      {!db ? <AdminSetupAlert issue="missing_service_role" /> : null}
      <Link href="/admin/conciergerie" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
        ← Chantiers à placer
      </Link>
      <AppPageHeader eyebrow="Conciergerie" title="Prospects artisans" description="Artisans non inscrits, importés d'annuaires publics." />

      <details className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-medium">Importer un fichier (xlsx, CSV, JSON)</summary>
        <div className="mt-4">
          <ProspectImportForm />
        </div>
      </details>

      <form className="flex gap-2" action="/admin/conciergerie/prospects">
        {status !== "all" ? <input type="hidden" name="statut" value={status} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Nom, ville, métier ou code postal" className="h-11 pl-9" />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          Chercher
        </Button>
      </form>

      <AdminTabs tabs={STATUSES.map((s) => ({ href: href(1, s.id), label: s.label, active: s.id === status }))} />

      <ul className="divide-y rounded-2xl border bg-card shadow-sm">
        {rows.length === 0 ? <li className="p-8 text-center text-sm text-muted-foreground">Aucun prospect dans cette vue.</li> : null}
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <ProspectIdentity p={p} />
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <ProspectStatusBadge status={p.status} />
              {p.contact_count ? (
                <span>
                  {p.contact_count} contact{p.contact_count > 1 ? "s" : ""}
                  {p.last_contacted_at ? ` · dernier le ${formatDateFr(p.last_contacted_at)}` : ""}
                </span>
              ) : null}
              {p.latitude === null && !p.opt_out ? <span className="text-amber-600">Non géolocalisé</span> : null}
            </div>
          </li>
        ))}
      </ul>

      <AdminPagination page={page} pageSize={PROSPECT_PAGE_SIZE} total={total} hrefFor={(p) => href(p)} />
    </div>
  );
}
