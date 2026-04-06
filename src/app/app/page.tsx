import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { StepCard } from "@/components/app/step-card";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppHomePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Espace artisan indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, slug")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { count: serviceCount } = profile?.id
    ? await supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("artisan_id", profile.id)
    : { count: 0 };

  const hasProfile = !!profile;
  const hasServices = (serviceCount ?? 0) > 0;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {hasProfile ? profile!.business_name : "Bienvenue"}
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          {hasProfile && hasServices
            ? "Ta vitrine est prête. Partage le lien pour recevoir des demandes de RDV."
            : hasProfile
              ? "Ajoute au moins une prestation pour que les clients puissent réserver."
              : "Trois étapes pour être en ligne : activité, prestations, puis ton lien à partager."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StepCard
          step={1}
          title="Mon activité"
          description="Nom, description et adresse web de ta page."
          done={hasProfile}
          href="/app/profile"
          actionLabel={hasProfile ? "Modifier" : "Remplir"}
        />
        <StepCard
          step={2}
          title="Mes prestations"
          description="Durée et prix affichés sur ta vitrine."
          done={hasServices}
          href="/app/services"
          actionLabel={hasServices ? "Gérer" : "Ajouter"}
        />
        <StepCard
          step={3}
          title="Ma page publique"
          description="Le lien à envoyer à tes clients."
          done={hasProfile && hasServices}
          href={hasProfile ? `/site/${profile!.slug}` : "/app/profile"}
          actionLabel="Voir la page"
        />
      </div>

      {hasProfile && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Lien de ta vitrine</p>
            <p className="mt-1 font-mono text-sm text-foreground">/site/{profile!.slug}</p>
          </div>
          <Link
            href={`/site/${profile!.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", className: "gap-2 shrink-0" })}
          >
            Ouvrir <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:underline" href="/">
          Retour au site AlphaSys
        </Link>
      </p>
    </div>
  );
}
