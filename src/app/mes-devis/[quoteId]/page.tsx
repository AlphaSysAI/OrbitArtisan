import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft, FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { QuoteSummary } from "@/components/ai/quote-summary";

import { ClientQuoteActions } from "./client-quote-actions";

export default async function ClientQuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mes-devis/${quoteId}`)}`);

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id,status,customer_user_id,artisan_id,signed_at,signed_by_name,rejected_at,labor_rate_per_hour,labor_duration_minutes,labor_total,materials_total,grand_total,notes,created_at,updated_at",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote || quote.customer_user_id !== user.id) notFound();

  const { data: artisan } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", quote.artisan_id)
    .maybeSingle();

  const { data: serviceLines } = await supabase
    .from("quote_services")
    .select("service_title,duration_minutes,unit_price")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const { data: materialLines } = await supabase
    .from("quote_materials")
    .select("label,quantity,unit_price,line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const services = serviceLines ?? [];
  const materials = materialLines ?? [];

  const q = quote as typeof quote & {
    signed_at?: string | null;
    signed_by_name?: string | null;
    rejected_at?: string | null;
  };

  const frameClass =
    q.status === "accepted"
      ? "border-2 border-green-600/70 shadow-sm shadow-green-600/10"
      : q.status === "rejected"
        ? "border-2 border-red-600/70 shadow-sm shadow-red-600/10"
        : "border border-border";

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4 sm:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Devis</p>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {artisan?.business_name ?? "Artisan"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Statut : {quote.status}</p>
        </div>
        <Link href="/mes-devis" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Mes devis
        </Link>
      </div>

      <div className={cn("grid gap-6 rounded-2xl p-4 lg:grid-cols-[1fr_360px] lg:p-6", frameClass)}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Prestations</CardTitle>
              <CardDescription>Détail des prestations incluses dans le devis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!services.length ? (
                <p className="text-sm text-muted-foreground">Aucune prestation.</p>
              ) : (
                <ul className="space-y-2">
                  {services.map((s, i) => (
                    <li key={`${s.service_title}-${i}`} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{s.service_title}</p>
                          <p className="text-sm text-muted-foreground">{s.duration_minutes} min</p>
                        </div>
                        {s.unit_price != null ? (
                          <p className="text-sm font-medium">
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                              (s.unit_price ?? 0) / 100,
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">sur devis</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Fournitures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!materials.length ? (
                <p className="text-sm text-muted-foreground">Aucune fourniture.</p>
              ) : (
                <ul className="space-y-2">
                  {materials.map((m, i) => (
                    <li key={`${m.label}-${i}`} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{m.label}</p>
                          <p className="text-sm text-muted-foreground">
                            Qté {m.quantity} ·{" "}
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                              (m.unit_price ?? 0) / 100,
                            )}{" "}
                            / unité
                          </p>
                        </div>
                        <p className="text-sm font-medium">
                          {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                            (m.line_total ?? 0) / 100,
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {quote.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <QuoteSummary quoteId={quoteId} />
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Total</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Main d&apos;œuvre</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (quote.labor_total ?? 0) / 100,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {quote.labor_duration_minutes} min ·{" "}
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (quote.labor_rate_per_hour ?? 0) / 100,
                    )}
                    /h
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Fournitures</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (quote.materials_total ?? 0) / 100,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span>
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (quote.grand_total ?? 0) / 100,
                    )}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Reçu le {new Date(quote.created_at).toLocaleString("fr-FR")}
              </p>

              {q.status === "accepted" && q.signed_at && (
                <div className="rounded-xl border border-green-600/30 bg-green-500/5 p-3 text-sm">
                  <p className="font-medium text-green-900 dark:text-green-100">Devis accepté et signé</p>
                  <p className="mt-1 text-muted-foreground">
                    Signature : <span className="font-medium text-foreground">{q.signed_by_name}</span>
                    {" · "}
                    {new Date(q.signed_at).toLocaleString("fr-FR")}
                  </p>
                </div>
              )}

              {q.status === "rejected" && q.rejected_at && (
                <div className="rounded-xl border border-red-600/30 bg-red-500/5 p-3 text-sm text-muted-foreground">
                  Refus enregistré le {new Date(q.rejected_at).toLocaleString("fr-FR")}.
                </div>
              )}

              <ClientQuoteActions quoteId={quoteId} status={q.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
