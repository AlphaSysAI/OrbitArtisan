import Link from "next/link";

import { Hammer, Plus } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { createProject } from "./actions";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function ChantiersPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Chantiers indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();

  const { data: projects } = profile?.id
    ? await supabase
        .from("projects")
        .select("id, name, client_name, status, budget_total_cents, created_at")
        .eq("artisan_id", profile.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Suivi"
        title="Chantiers"
        description="Rentabilité réelle : compare le budget devisé aux heures MO saisies."
      />

      <form action={createProject} className="app-surface grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Nom du chantier</Label>
          <Input id="name" name="name" placeholder="Rénovation salle de bain — Dupont" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client_name">Client</Label>
          <Input id="client_name" name="client_name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget_eur">Budget (€ TTC)</Label>
          <Input id="budget_eur" name="budget_eur" inputMode="decimal" placeholder="8500" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="gap-2">
            <Plus className="h-4 w-4" />
            Créer le chantier
          </Button>
        </div>
      </form>

      {!projects?.length ? (
        <p className="text-sm text-muted-foreground">Aucun chantier pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/app/chantiers/${p.id}`}
                className="app-surface flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Hammer className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.client_name ?? "—"} · {p.status}</p>
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums">{formatEur(p.budget_total_cents ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
