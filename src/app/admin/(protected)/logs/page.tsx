import { listAdminAuditLogs } from "@/app/admin/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const { items, total, pageSize } = await listAdminAuditLogs(page, 40);

  const admin = createSupabaseAdminClient();
  const adminEmails = new Map<string, string | null>();
  for (const row of items) {
    const id = row.admin_user_id as string;
    if (adminEmails.has(id)) continue;
    const { data } = await admin.auth.admin.getUserById(id);
    adminEmails.set(id, data.user?.email ?? null);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Traçabilité</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Logs / Audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} entrée{total > 1 ? "s" : ""}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Admin</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Cible</th>
              <th className="px-4 py-3 font-semibold">Détails</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun log pour l&apos;instant.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id as string} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(row.created_at as string).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">{adminEmails.get(row.admin_user_id as string) ?? row.admin_user_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.action as string}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(row.target_profile_id as string | null)?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-4 py-3 max-w-md truncate text-xs text-muted-foreground">
                    {row.details ? JSON.stringify(row.details) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize ? (
        <p className="text-sm text-muted-foreground">Page {page}</p>
      ) : null}
    </div>
  );
}
