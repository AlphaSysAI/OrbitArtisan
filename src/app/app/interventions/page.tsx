import Link from "next/link";

import { ClipboardList, ExternalLink, Plus } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupabaseMissing } from "@/components/supabase-missing";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { createWorkOrder } from "../chantiers/actions";

export default async function InterventionsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Interventions indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();

  const { data: orders } = profile?.id
    ? await supabase
        .from("work_orders")
        .select("id, title, client_name, reference_number, status, public_token, signed_at, created_at")
        .eq("artisan_id", profile.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const origin = getPublicSiteUrl();

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Terrain"
        title="Bons d'intervention"
        description="Crée un bon, envoie le lien au client pour signature sur mobile."
      />

      <form action={createWorkOrder} className="app-surface grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Intitulé</Label>
          <Input id="title" name="title" placeholder="Intervention plomberie" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client_name">Client</Label>
          <Input id="client_name" name="client_name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="site_address">Adresse chantier</Label>
          <Input id="site_address" name="site_address" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} />
        </div>
        <Button type="submit" className="gap-2 sm:col-span-2">
          <Plus className="h-4 w-4" />
          Créer le bon d&apos;intervention
        </Button>
      </form>

      {!orders?.length ? (
        <p className="text-sm text-muted-foreground">Aucun bon d&apos;intervention.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="app-surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {o.reference_number} · {o.client_name ?? "—"} · {o.status}
                    {o.signed_at ? ` · Signé ${new Date(o.signed_at).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
              </div>
              <Link
                href={`${origin}/intervention/${o.public_token}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                Lien signature
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
