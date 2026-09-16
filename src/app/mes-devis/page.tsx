import Link from "next/link";
import { redirect } from "next/navigation";

import { FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import {
  fetchNotificationWatermark,
  isQuoteUnreadForCustomer,
} from "@/lib/notifications/unread-items";
import { quoteStatusLabel } from "@/lib/status-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MesDevisPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/mes-devis");

  const [{ data: quotes }, quotesReceivedWatermark] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, grand_total, created_at, artisan_id, sent_at, updated_at")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false }),
    fetchNotificationWatermark(supabase, user.id, "quotes_received"),
  ]);

  const items = quotes ?? [];

  const artisanIds = [...new Set(items.map((q) => q.artisan_id).filter(Boolean))] as string[];
  const { data: artisans } = artisanIds.length
    ? await supabase.from("profiles").select("id, business_name").in("id", artisanIds)
    : { data: [] as { id: string; business_name: string }[] };

  const artisanName = (id: string) => artisans?.find((a) => a.id === id)?.business_name ?? "Artisan";

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4 sm:py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes devis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les devis que tes artisans t’ont envoyés depuis la messagerie.
        </p>
      </div>

      {!items.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Aucun devis
            </CardTitle>
            <CardDescription>Tu recevras un message quand un artisan t’en enverra un.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((q) => {
            const unread = isQuoteUnreadForCustomer(q, quotesReceivedWatermark);
            return (
            <li
              key={q.id}
              className={`rounded-2xl border bg-card p-4 ${unread ? "border-destructive/25 bg-destructive/[0.03]" : ""}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {unread ? (
                      <span className="size-2.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                    ) : null}
                    <p className={unread ? "font-bold" : "font-medium"}>{artisanName(q.artisan_id)}</p>
                    {unread ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Nouveau
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(q.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · Statut : {quoteStatusLabel(q.status)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (q.grand_total ?? 0) / 100,
                    )}
                  </span>
                  <Link href={`/mes-devis/${q.id}`} className={buttonVariants({ size: "sm" })}>
                    Voir
                  </Link>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
