import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { addTimeEntry } from "../actions";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function ChantierDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Chantier indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id, labor_rate_per_hour").eq("user_id", user!.id).maybeSingle();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, budget_total_cents, budget_labor_cents, status, artisan_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.artisan_id !== profile?.id) notFound();

  const { data: entries } = await supabase
    .from("project_time_entries")
    .select("id, entry_date, duration_minutes, cost_cents, description, worker_name, hourly_rate_cents")
    .eq("project_id", projectId)
    .order("entry_date", { ascending: false });

  const actualMoCents = (entries ?? []).reduce((acc, e) => acc + (e.cost_cents ?? 0), 0);
  const actualMinutes = (entries ?? []).reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0);
  const budget = project.budget_total_cents ?? 0;
  const marginCents = budget - actualMoCents;
  const marginPct = budget > 0 ? Math.round((marginCents / budget) * 100) : 0;

  const defaultRateEur = ((profile?.labor_rate_per_hour ?? 4500) / 100).toFixed(2).replace(".", ",");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/app/chantiers" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Chantiers
        </Link>
      </div>

      <AppPageHeader eyebrow="Chantier" title={project.name} description={project.client_name ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="app-surface p-5">
          <p className="text-xs uppercase text-muted-foreground">Budget devisé</p>
          <p className="text-2xl font-semibold">{formatEur(budget)}</p>
        </div>
        <div className="app-surface p-5">
          <p className="text-xs uppercase text-muted-foreground">MO saisie ({Math.round(actualMinutes / 60)} h)</p>
          <p className="text-2xl font-semibold">{formatEur(actualMoCents)}</p>
        </div>
        <div className={cn("app-surface p-5", marginCents >= 0 ? "border-green-600/30" : "border-red-600/30")}>
          <p className="text-xs uppercase text-muted-foreground">Marge estimée</p>
          <p className="text-2xl font-semibold">
            {formatEur(marginCents)} <span className="text-base font-normal">({marginPct} %)</span>
          </p>
        </div>
      </div>

      <form action={addTimeEntry} className="app-surface grid gap-4 p-6 sm:grid-cols-2">
        <input type="hidden" name="project_id" value={projectId} />
        <div className="space-y-2">
          <Label htmlFor="duration_minutes">Durée (minutes)</Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={1} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hourly_rate_eur">Taux horaire (€)</Label>
          <Input id="hourly_rate_eur" name="hourly_rate_eur" defaultValue={defaultRateEur} inputMode="decimal" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker_name">Intervenant</Label>
          <Input id="worker_name" name="worker_name" placeholder="Nom (facultatif)" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} />
        </div>
        <Button type="submit">Enregistrer le temps</Button>
      </form>

      <div className="app-surface p-6">
        <h2 className="mb-4 font-semibold">Historique MO</h2>
        {!entries?.length ? (
          <p className="text-sm text-muted-foreground">Aucune saisie.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-4 border-b py-2 last:border-0">
                <span>
                  {new Date(e.entry_date).toLocaleDateString("fr-FR")} — {e.duration_minutes} min
                  {e.description ? ` · ${e.description}` : ""}
                  {e.worker_name ? ` (${e.worker_name})` : ""}
                </span>
                <span className="font-medium tabular-nums">{formatEur(e.cost_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
