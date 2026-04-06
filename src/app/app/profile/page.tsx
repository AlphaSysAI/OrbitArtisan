import Link from "next/link";

import { SupabaseMissing } from "@/components/supabase-missing";
import { buttonVariants } from "@/components/ui/button-variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Profil indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, business_name, description, logo_url, slug, accent_color, labor_rate_per_hour")
    .eq("user_id", user!.id)
    .maybeSingle();

  const initialValues = profile ?? {
    name: null,
    business_name: "",
    description: null,
    logo_url: null,
    slug: "",
    accent_color: null as string | null,
    labor_rate_per_hour: null as number | null,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Étape 1</p>
          <h1 className="text-2xl font-semibold tracking-tight">Mon activité</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce que les clients voient en premier sur ta page.
          </p>
        </div>
        <Link href="/app/services" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Étape suivante : prestations →
        </Link>
      </div>

      <ProfileForm initialValues={initialValues} />
    </div>
  );
}
