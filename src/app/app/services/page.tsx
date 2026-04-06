import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CreateServiceForm } from "./create-service-form";
import { ServiceRow } from "./service-row";

export default async function ServicesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Services indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, slug, business_name")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: services } = profile?.id
    ? await supabase
        .from("services")
        .select("id, title, duration, price")
        .eq("artisan_id", profile.id)
        .order("title", { ascending: true })
    : { data: [] as { id: string; title: string; duration: number; price: number | null }[] };

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Étape 2</p>
          <h1 className="text-2xl font-semibold tracking-tight">Mes prestations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque prestation = un bouton sur ta page pour réserver.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>
            ← Activité
          </Link>
          {profile?.slug && (
            <Link
              href={`/site/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm" })}
            >
              Voir ma page
            </Link>
          )}
        </div>
      </div>

      {!profile && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            D’abord, indique le nom de ton activité.
          </p>
          <Link className="mt-2 inline-block font-medium underline underline-offset-4" href="/app/profile">
            Aller à l’étape 1
          </Link>
        </div>
      )}

      <CreateServiceForm disabled={!profile} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Liste</h2>
        {!services?.length ? (
          <p className="rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            Aucune prestation pour l’instant. Ajoute-en une ci-dessus.
          </p>
        ) : (
          <ul className="space-y-2">
            {services.map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
