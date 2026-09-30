import Link from "next/link";

import { ProspectImportForm } from "@/components/admin/concierge/concierge-actions";
import { ProspectIdentity, ProspectStatusBadge } from "@/components/admin/concierge/prospect-bits";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { getAdminDb } from "@/lib/admin/db";
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
  const pages = Math.max(1, Math.ceil(total / PROSPECT_PAGE_SIZE));
  const href = (over: Record<string, string | number>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), statut: status, page: String(page) });
    for (const [k, v] of Object.entries(over)) params.set(k, String(v));
    return `/admin/conciergerie/prospects?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AppPageHeader eyebrow="Conciergerie" title="Prospects artisans" description={`${total} fiche${total > 1 ? "s" : ""}`} />
        <Link href="/admin/conciergerie" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Alertes chantiers
        </Link>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 font-semibold">Importer un fichier</h2>
        <ProspectImportForm />
      </section>

      <form className="flex flex-wrap items-center gap-2" action="/admin/conciergerie/prospects">
        <Input name="q" defaultValue={q} placeholder="Nom, ville, métier ou code postal" className="max-w-xs" />
        <input type="hidden" name="statut" value={status} />
        <button type="submit" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Filtrer
        </button>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s.id}
              href={href({ statut: s.id, page: 1 })}
              className={buttonVariants({ size: "sm", variant: s.id === status ? "default" : "ghost" })}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <ul className="divide-y rounded-2xl border bg-card shadow-sm">
        {rows.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">Aucun prospect.</li> : null}
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <ProspectIdentity p={p} />
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <ProspectStatusBadge status={p.status} />
              {p.contact_count ? <span>{p.contact_count} contact{p.contact_count > 1 ? "s" : ""}</span> : null}
              {p.latitude === null && !p.opt_out ? <span className="text-amber-600">Non géolocalisé</span> : null}
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })}>← Précédent</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} / {pages}
          </span>
          {page < pages ? <Link href={href({ page: page + 1 })}>Suivant →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
