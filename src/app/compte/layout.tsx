import { redirect } from "next/navigation";

import { ClientShell } from "@/components/app/client-shell";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompteLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Espace client indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compte");

  const { data: artisanProfile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (artisanProfile) redirect("/app");

  return <ClientShell>{children}</ClientShell>;
}
