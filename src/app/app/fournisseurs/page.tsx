import { AppPageHeader } from "@/components/app/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { createSupplier } from "../chantiers/actions";

export default async function FournisseursPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Fournisseurs indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();

  const { data: suppliers } = profile?.id
    ? await supabase
        .from("suppliers")
        .select("id, name, contact_name, email, phone, siret")
        .eq("artisan_id", profile.id)
        .order("name", { ascending: true })
    : { data: [] };

  return (
    <div className="space-y-8">
      <AppPageHeader eyebrow="Achats" title="Fournisseurs" description="Carnet d'adresses fournisseurs pour tes achats matériaux." />

      <form action={createSupplier} className="app-surface grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Raison sociale</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_name">Contact</Label>
          <Input id="contact_name" name="contact_name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="siret">SIRET</Label>
          <Input id="siret" name="siret" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>
        <Button type="submit" className="sm:col-span-2">
          Ajouter le fournisseur
        </Button>
      </form>

      {!suppliers?.length ? (
        <p className="text-sm text-muted-foreground">Aucun fournisseur enregistré.</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {suppliers.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[s.contact_name, s.email, s.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {s.siret ? <span className="font-mono text-xs text-muted-foreground">{s.siret}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
