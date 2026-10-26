import Link from "next/link";

import { listAdminAuditLogs } from "@/app/admin/actions";
import { AppPageHeader } from "@/components/app/app-page-header";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { AdminPagination, adminHref } from "@/components/admin/ui/admin-pagination";
import { AdminTabs } from "@/components/admin/ui/admin-tabs";
import { getAdminDb } from "@/lib/admin/db";
import { AUDIT_CATEGORIES, auditActionLabel } from "@/lib/admin/labels";
import { fetchUserEmails } from "@/lib/admin/tenants";
import { formatDateTimeFr } from "@/lib/format/date";

const PAGE_SIZE = 40;

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (Array.isArray(v)) return v.map(formatValue).join(", ") || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;
  const category = typeof sp.type === "string" && AUDIT_CATEGORIES.some((c) => c.id === sp.type) ? sp.type : null;

  const admin = getAdminDb();
  if (!admin) return <AdminSetupAlert issue="missing_service_role" />;

  const { items, total } = await listAdminAuditLogs(page, PAGE_SIZE, category);
  const rows = items as {
    id: string;
    admin_user_id: string;
    target_profile_id: string | null;
    action: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }[];

  const profileIds = [...new Set(rows.map((r) => r.target_profile_id).filter((v): v is string => Boolean(v)))];
  const [emails, { data: profiles }] = await Promise.all([
    fetchUserEmails(admin, [...new Set(rows.map((r) => r.admin_user_id))]),
    profileIds.length ? admin.from("profiles").select("id, business_name").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.business_name as string | null) || "Artisan sans raison sociale"]));
  const href = (p: number, type: string | null = category) => adminHref("/admin/logs", { type, page: p });

  return (
    <div className="space-y-5">
      <AppPageHeader eyebrow="Traçabilité" title="Journal" description="Chaque action et consultation sensible de l'admin, la plus récente en premier." />

      <AdminTabs
        tabs={[
          { href: href(1, null), label: "Tout", active: category === null },
          ...AUDIT_CATEGORIES.map((c) => ({ href: href(1, c.id), label: c.label, active: category === c.id })),
        ]}
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucune entrée.</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-sm">
          {rows.map((row) => {
            const details = row.details && Object.keys(row.details).length ? Object.entries(row.details) : [];
            return (
              <li key={row.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{auditActionLabel(row.action)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTimeFr(row.created_at, { dateStyle: "short", timeStyle: "medium" })}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  par {emails.get(row.admin_user_id) ?? "admin inconnu"}
                  {row.target_profile_id ? (
                    <>
                      {" · "}
                      <Link href={`/admin/tenants/${row.target_profile_id}`} className="underline underline-offset-4">
                        {names.get(row.target_profile_id) ?? "compte supprimé"}
                      </Link>
                    </>
                  ) : null}
                </p>
                {details.length ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Détails</summary>
                    <dl className="mt-2 grid gap-1 rounded-lg bg-muted/40 p-2 sm:grid-cols-[160px_1fr]">
                      {details.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="font-mono text-muted-foreground">{k}</dt>
                          <dd className="break-all">{formatValue(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => href(p)} />
    </div>
  );
}
