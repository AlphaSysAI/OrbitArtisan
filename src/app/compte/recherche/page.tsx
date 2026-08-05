import { redirect } from "next/navigation";

import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { RechercheClient } from "./recherche-client";

export default async function RechercheArtisanPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Recherche indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compte/recherche");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trouver un artisan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cherche un professionnel autour de toi, par métier.
        </p>
      </div>

      <RechercheClient />
    </div>
  );
}
