import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";

/** Pagination en liens ; `hrefFor(page)` conserve les filtres courants. */
export function AdminPagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {from}–{to} sur {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            ← Précédent
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Suivant →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Construit une URL en ne gardant que les paramètres renseignés. */
export function adminHref(path: string, params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "" && !(k === "page" && Number(v) === 1)) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
