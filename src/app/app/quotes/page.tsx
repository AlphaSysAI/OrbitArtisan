import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppListItem } from "@/components/app/app-list-item";
import { AppPageHeader } from "@/components/app/app-page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quoteStatusLabel } from "@/lib/status-labels";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

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
      <div className="space-y-8">
        <AppPageHeader
          eyebrow="Commercial"
          title="Devis"
          description="Configure ton activité pour créer des devis."
        />
        <AppEmptyState
          icon={FileText}
          title="Profil artisan requis"
          description="Commence par renseigner ton activité, puis tes prestations."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Aller aux réglages
            </Link>
          }
        />
      </div>
    );
  }

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(
      "id, status, customer_name, customer_email, grand_total, labor_total, materials_total, created_at, updated_at",
    )
    .eq("artisan_id", profile.id)
    .order("created_at", { ascending: false });

  const items = error ? [] : (quotes ?? []);

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Commercial"
        title="Devis"
        description="Crée un devis en sélectionnant tes prestations, puis ajoute au besoin des fournitures."
        action={
          <Link href="/app/quotes/new" className={buttonVariants({ size: "lg", className: "gap-2" })}>
            <Plus className="size-4" />
            Nouveau devis
          </Link>
        }
      />

      {!items.length ? (
        <AppEmptyState
          icon={FileText}
          title="Aucun devis pour l’instant"
          description="Ton premier devis part en deux minutes : client, prestations, envoi."
          action={
            <Link href="/app/quotes/new" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              <Plus className="size-4" />
              Créer un devis
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((q) => (
            <li key={q.id}>
              <AppListItem
                href={`/app/quotes/${q.id}`}
                title={q.customer_name || q.customer_email || "Client"}
                subtitle={`Total ${formatEur(q.grand_total ?? 0)}`}
                meta={
                  <Badge
                    variant={
                      q.status === "accepted"
                        ? "default"
                        : q.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {quoteStatusLabel(q.status)}
                  </Badge>
                }
                emphasis={
                  q.status === "accepted" ? "success" : q.status === "rejected" ? "danger" : "default"
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
