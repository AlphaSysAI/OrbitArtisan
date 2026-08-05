import Link from "next/link";

import { FileText, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quoteStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";

export default async function QuotesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <p className="text-sm text-muted-foreground">
          Commence par renseigner ton activité (Étape 1), puis tes prestations (Étape 2).
        </p>
        <Link href="/app/reglages?tab=activite" className={buttonVariants({ variant: "outline" })}>
          Aller à l’étape 1
        </Link>
      </div>
    );
  }

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, status, customer_name, customer_email, grand_total, labor_total, materials_total, created_at, updated_at")
    .eq("artisan_id", profile.id)
    .order("created_at", { ascending: false });

  const items = error ? [] : (quotes ?? []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Section</p>
          <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crée un devis en sélectionnant tes prestations, puis ajoute au besoin des fournitures.
          </p>
        </div>

        <Link
          href="/app/quotes/new"
          className={buttonVariants({ className: "gap-2 inline-flex", size: "sm" })}
        >
          <Plus className="h-4 w-4" />
          Nouveau devis
        </Link>
      </div>

      {!items.length ? (
        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Aucun devis
            </CardTitle>
            <CardDescription>Crée ton premier devis.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app/quotes/new" className={buttonVariants()}>
              Créer un devis
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((q) => (
            <li
              key={q.id}
              className={cn(
                "rounded-2xl border bg-card p-4",
                q.status === "accepted" && "border-2 border-green-600/70",
                q.status === "rejected" && "border-2 border-red-600/70",
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    {q.customer_name || q.customer_email || "Client"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Statut : {quoteStatusLabel(q.status)}
                    {" · "}
                    Total :{" "}
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (q.grand_total ?? 0) / 100,
                    )}
                  </p>
                </div>
                <Link
                  href={`/app/quotes/${q.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Ouvrir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

