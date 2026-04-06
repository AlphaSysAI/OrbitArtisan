import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarHeart, FileText, MessageSquare, Receipt } from "lucide-react";

import { finalizePendingVitrineAppointment } from "@/app/site/[slug]/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompteHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pending = typeof sp.pending === "string" ? sp.pending : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  if (pending) {
    const result = await finalizePendingVitrineAppointment(pending);
    if (result.ok) redirect("/compte?success=rdv");
  }

  const showRdvSuccess = sp.success === "rdv";

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: quoteCount } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("customer_user_id", user.id);

  const { count: invoiceCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("customer_user_id", user.id)
    .in("status", ["sent", "paid"]);

  const { data: rdvRows } = await supabase
    .from("appointments")
    .select(
      `
      id,
      start_time,
      status,
      profiles ( business_name, slug ),
      services ( title )
    `,
    )
    .eq("customer_user_id", user.id)
    .order("start_time", { ascending: true })
    .limit(30);

  type RdvRowRaw = {
    id: string;
    start_time: string;
    status: string;
    profiles: { business_name: string; slug: string } | { business_name: string; slug: string }[] | null;
    services: { title: string } | { title: string }[] | null;
  };

  function one<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const rdvs = (rdvRows ?? []) as RdvRowRaw[];

  const displayName = cp?.display_name ?? "toi";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bonjour, {displayName}</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Ici tu retrouves tes devis, tes rendez-vous et tes échanges avec les artisans — sans configuration
          d’entreprise.
        </p>
      </div>

      {showRdvSuccess && (
        <Alert>
          <AlertTitle>Rendez-vous enregistré</AlertTitle>
          <AlertDescription>
            Ta demande est bien liée à ton compte. L’artisan confirmera le créneau.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/20 sm:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarHeart className="h-5 w-5" />
              Mes rendez-vous
            </CardTitle>
            <CardDescription>
              Créneaux réservés depuis les pages vitrine (liés à ton compte).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rdvs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun rendez-vous enregistré pour l’instant.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {rdvs.map((r) => {
                  const d = new Date(r.start_time);
                  const prof = one(r.profiles);
                  const svc = one(r.services);
                  const artisan = prof?.business_name ?? "Artisan";
                  const slug = prof?.slug;
                  const service = svc?.title;
                  const statusFr =
                    r.status === "confirmed"
                      ? "Confirmé"
                      : r.status === "cancelled"
                        ? "Annulé"
                        : "En attente";
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">
                          {d.toLocaleString("fr-FR", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-muted-foreground">
                          {slug ? (
                            <Link href={`/site/${slug}`} className="underline-offset-4 hover:underline">
                              {artisan}
                            </Link>
                          ) : (
                            artisan
                          )}
                          {service ? ` · ${service}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{statusFr}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Mes devis
            </CardTitle>
            <CardDescription>
              {quoteCount ? `${quoteCount} devis enregistré${quoteCount > 1 ? "s" : ""}.` : "Aucun devis pour l’instant."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/mes-devis" className={buttonVariants({ className: "w-full sm:w-auto" })}>
              Voir mes devis
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Factures
            </CardTitle>
            <CardDescription>
              {invoiceCount
                ? `${invoiceCount} facture${invoiceCount > 1 ? "s" : ""} reçue${invoiceCount > 1 ? "s" : ""}.`
                : "Aucune facture envoyée pour l’instant."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/compte/factures" className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}>
              Voir mes factures
            </Link>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Messages
            </CardTitle>
            <CardDescription>Conversations ouvertes depuis les pages vitrine des artisans.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/compte/messages" className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}>
              Ouvrir la messagerie
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:underline" href="/">
          Retour au site AlphaSys
        </Link>
      </p>
    </div>
  );
}
